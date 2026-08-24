import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpertContextControl } from "./ExpertContextControl";
import type { ExpertSelection } from "./ExpertSelector";

const getHealth = vi.fn();
const listCatalog = vi.fn();
const listSkills = vi.fn();
const refreshCatalog = vi.fn();

beforeEach(() => {
  getHealth.mockReset();
  listCatalog.mockReset();
  listSkills.mockReset();
  refreshCatalog.mockReset();
  getHealth.mockResolvedValue({
    ok: true,
    status: "ready",
    gateway: {},
    catalog: {},
  });
  listCatalog.mockResolvedValue([
    {
      name: "call-prep",
      slug: "call-prep",
      kind: "expert",
      status: "ready",
      publicSkillCount: 1,
      callableSkillCount: 1,
    },
  ]);
  listSkills.mockResolvedValue([
    {
      name: "customer-profiling",
      status: "ready",
      callEnabled: true,
      riskLevel: "low",
      approvalMode: "auto",
    },
  ]);
  refreshCatalog.mockResolvedValue([]);
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: {
      expert: {
        getHealth,
        listCatalog,
        listSkills,
        refreshCatalog,
      },
    },
  });
});

describe("ExpertContextControl", () => {
  // @lat: [[expert-execution-tests#Context control active gate]]
  it("does not fetch health when inactive on mount", () => {
    const value: ExpertSelection = { expertSlug: null, skillName: null };
    render(
      <div className="chat-input-toolbar" style={{ width: 1000 }}>
        <ExpertContextControl
          value={value}
          onChange={vi.fn()}
          authGeneration="user:u1"
          active={false}
          onGatewayStatusChange={vi.fn()}
          onSelectedCallabilityChange={vi.fn()}
        />
      </div>,
    );
    expect(screen.getByTestId("work-context-chip")).toHaveTextContent(
      "Local Chat",
    );
    expect(getHealth).not.toHaveBeenCalled();
  });

  it("opens popover and clears selection when active", async () => {
    const onChange = vi.fn();
    const value: ExpertSelection = {
      expertSlug: "call-prep",
      skillName: "customer-profiling",
    };

    render(
      <div className="chat-input-toolbar" style={{ width: 1000 }}>
        <ExpertContextControl
          value={value}
          onChange={onChange}
          authGeneration="user:u1"
          active
          onGatewayStatusChange={vi.fn()}
          onSelectedCallabilityChange={vi.fn()}
        />
      </div>,
    );

    await waitFor(() => expect(getHealth).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByTestId("work-context-popover")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith({
      expertSlug: null,
      skillName: null,
    });
  });

  // @lat: [[expert-execution-tests#Context control stale skills]]
  it("does not apply stale skill results after expert switch", async () => {
    let resolveA: (value: unknown) => void = () => undefined;
    const skillsA = new Promise((resolve) => {
      resolveA = resolve;
    });
    listSkills
      .mockImplementationOnce(() => skillsA)
      .mockResolvedValueOnce([
        {
          name: "skill-b",
          status: "ready",
          callEnabled: true,
          riskLevel: "low",
          approvalMode: "auto",
        },
      ]);

    const onChange = vi.fn();
    const { rerender } = render(
      <div className="chat-input-toolbar" style={{ width: 1000 }}>
        <ExpertContextControl
          value={{ expertSlug: "expert-a", skillName: null }}
          onChange={onChange}
          authGeneration="user:u1"
          active
          onGatewayStatusChange={vi.fn()}
          onSelectedCallabilityChange={vi.fn()}
        />
      </div>,
    );

    await waitFor(() => expect(listSkills).toHaveBeenCalled());

    rerender(
      <div className="chat-input-toolbar" style={{ width: 1000 }}>
        <ExpertContextControl
          value={{ expertSlug: "expert-b", skillName: null }}
          onChange={onChange}
          authGeneration="user:u1"
          active
          onGatewayStatusChange={vi.fn()}
          onSelectedCallabilityChange={vi.fn()}
        />
      </div>,
    );

    await waitFor(() => expect(listSkills).toHaveBeenCalledTimes(2));

    await act(async () => {
      resolveA([
        {
          name: "skill-a-stale",
          status: "ready",
          callEnabled: true,
          riskLevel: "low",
          approvalMode: "auto",
        },
      ]);
    });

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    await waitFor(() =>
      expect(screen.getByTestId("work-context-popover")).toBeInTheDocument(),
    );
    expect(screen.queryByText("skill-a-stale")).not.toBeInTheDocument();
  });
});
