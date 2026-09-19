// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeConnector } from "./KnowledgeConnector";

describe("KnowledgeConnector", () => {
  const list = vi.fn();
  const get = vi.fn();
  const onSelect = vi.fn();

  beforeEach(() => {
    list.mockReset();
    get.mockReset();
    onSelect.mockReset();
    list.mockResolvedValue({
      items: [
        { id: "KS-A", name: "Set A", status: "active" },
        { id: "KS-B", name: "Set B", status: "archived" },
      ],
    });
    get.mockResolvedValue({ id: "KS-A", name: "Set A", status: "active" });
    (
      window as unknown as {
        hermesAPI: {
          knowledgeJobs: { sets: { list: typeof list; get: typeof get } };
        };
      }
    ).hermesAPI = {
      knowledgeJobs: { sets: { list, get } },
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("lists active sets and selects before lock", async () => {
    render(
      <KnowledgeConnector
        selectedSetId={null}
        locked={false}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Knowledge: Select/i }));
    await waitFor(() => {
      expect(screen.getByText("Set A")).toBeTruthy();
    });
    expect(screen.queryByText("Set B")).toBeNull();
    fireEvent.click(screen.getByText("Set A"));
    expect(onSelect).toHaveBeenCalledWith("KS-A");
  });

  it("does not call onSelect when locked", async () => {
    render(
      <KnowledgeConnector
        selectedSetId="KS-A"
        locked
        onSelect={onSelect}
      />,
    );
    await waitFor(() => {
      expect(list).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByRole("button", { name: /Knowledge:/i }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
