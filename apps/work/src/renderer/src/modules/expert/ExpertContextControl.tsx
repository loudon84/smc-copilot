import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ExpertCatalogItem,
  ExpertGatewayStatus,
  ExpertHealthResponse,
  ExpertSkillItem,
  SelectedCallability,
} from "../../../../shared/expert";
import {
  canSilentCallExpertSkill,
  decodeExpertIpcError,
  describeSilentCallDenial,
  formatExpertHealthUserMessage,
} from "../../../../shared/expert";
import { ExpertSelector, type ExpertSelection } from "./ExpertSelector";
import { WorkContextChip, type WorkContextDensity } from "./WorkContextChip";
import { WorkContextPopover } from "./WorkContextPopover";

export interface ExpertContextControlProps {
  value: ExpertSelection;
  onChange: (next: ExpertSelection) => void;
  authGeneration: string;
  active: boolean;
  onGatewayStatusChange: (status: ExpertGatewayStatus) => void;
  onSelectedCallabilityChange: (snapshot: SelectedCallability | null) => void;
  disabled?: boolean;
}

function catalogLabel(item: ExpertCatalogItem): string {
  if (item.displayName && item.displayName.trim()) return item.displayName;
  if (item.name.trim()) return item.name;
  return item.slug;
}

function skillLabel(item: ExpertSkillItem): string {
  if (item.displayName && item.displayName.trim()) return item.displayName;
  return item.name;
}

function densityFromWidth(width: number): WorkContextDensity {
  if (width >= 960) return "full";
  if (width >= 720) return "expert";
  return "icon";
}

function mapHealthError(err: unknown): ExpertGatewayStatus {
  const decoded = decodeExpertIpcError(err);
  const status = decoded?.status ?? null;
  const errorCode = decoded?.errorCode ?? null;

  if (errorCode === "INVALID_HEALTH_PAYLOAD") return "error";
  if (status === 403 || status === 404) return "error";
  if (status !== null && status >= 500) return "unavailable";
  if (status === 401) return "unavailable";
  return "unavailable";
}

function healthErrorMessage(err: unknown, status: ExpertGatewayStatus): string {
  return formatExpertHealthUserMessage(status, decodeExpertIpcError(err), err);
}

function gatewayStatusLabel(status: ExpertGatewayStatus): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "checking":
      return "Checking";
    case "unknown":
      return "Unknown";
    case "unavailable":
      return "Unavailable";
    case "error":
      return "Error";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/**
 * Sole UI owner for Expert health/catalog/skill/refresh/revision/callability.
 * Selection truth remains in Chat via controlled value/onChange.
 */
export function ExpertContextControl({
  value,
  onChange,
  authGeneration,
  active,
  onGatewayStatusChange,
  onSelectedCallabilityChange,
  disabled = false,
}: ExpertContextControlProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [gatewayStatus, setGatewayStatus] =
    useState<ExpertGatewayStatus>("unknown");
  const [catalog, setCatalog] = useState<ExpertCatalogItem[]>([]);
  const [skills, setSkills] = useState<ExpertSkillItem[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [emptyCatalog, setEmptyCatalog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [density, setDensity] = useState<WorkContextDensity>("full");

  const revisionRef = useRef(0);
  const mountedRef = useRef(true);
  const dirtyWhileInactiveRef = useRef(false);
  const authGenerationRef = useRef(authGeneration);
  const wrapRef = useRef<HTMLDivElement>(null);

  const bumpRevision = useCallback((): number => {
    revisionRef.current += 1;
    return revisionRef.current;
  }, []);

  const setStatus = useCallback(
    (status: ExpertGatewayStatus) => {
      setGatewayStatus(status);
      onGatewayStatusChange(status);
    },
    [onGatewayStatusChange],
  );

  const reconcileSelection = useCallback(
    (
      revision: number,
      nextCatalog: ExpertCatalogItem[],
      nextSkills: ExpertSkillItem[] | null,
      current: ExpertSelection,
    ) => {
      if (!mountedRef.current || revision !== revisionRef.current) return;
      if (!current.expertSlug) return;
      const expert = nextCatalog.find(
        (item) => item.slug === current.expertSlug,
      );
      if (!expert) {
        onChange({ expertSlug: null, skillName: null });
        return;
      }
      if (current.skillName && nextSkills) {
        const skill = nextSkills.find(
          (item) => item.name === current.skillName,
        );
        if (!skill) {
          onChange({ expertSlug: current.expertSlug, skillName: null });
        }
      }
    },
    [onChange],
  );

  const valueRef = useRef(value);
  valueRef.current = value;
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;

  const loadSkills = useCallback(
    async (expertSlug: string, revision: number) => {
      setSkillsLoading(true);
      try {
        const items = await window.hermesAPI.expert.listSkills(expertSlug);
        if (!mountedRef.current || revision !== revisionRef.current) return;
        setSkills(items);
        reconcileSelection(revision, catalogRef.current, items, {
          expertSlug,
          skillName: valueRef.current.skillName,
        });
      } catch (err) {
        if (!mountedRef.current || revision !== revisionRef.current) return;
        setSkills([]);
        setError(healthErrorMessage(err, mapHealthError(err)));
      } finally {
        if (mountedRef.current && revision === revisionRef.current) {
          setSkillsLoading(false);
        }
      }
    },
    [reconcileSelection],
  );

  const loadHealthAndCatalog = useCallback(
    async (reason: "mount" | "refresh" | "auth" | "focus" | "activate") => {
      if (!mountedRef.current) return;
      const revision =
        reason === "mount" || reason === "refresh" || reason === "auth"
          ? bumpRevision()
          : revisionRef.current;
      if (reason === "auth") {
        setStatus("unknown");
      } else {
        setStatus("checking");
      }
      setError(null);
      if (reason === "refresh") setRefreshing(true);

      try {
        let health: ExpertHealthResponse;
        try {
          health = await window.hermesAPI.expert.getHealth();
        } catch (err) {
          if (!mountedRef.current || revision !== revisionRef.current) return;
          const mapped = mapHealthError(err);
          setStatus(mapped);
          setError(healthErrorMessage(err, mapped));
          return;
        }
        if (!mountedRef.current || revision !== revisionRef.current) return;
        if (health.ok === true) {
          setStatus("ready");
        } else {
          setStatus("error");
        }

        const items =
          reason === "refresh"
            ? await window.hermesAPI.expert.refreshCatalog()
            : await window.hermesAPI.expert.listCatalog();
        if (!mountedRef.current || revision !== revisionRef.current) return;
        setCatalog(items);
        setEmptyCatalog(items.length === 0);
        reconcileSelection(revision, items, null, valueRef.current);
        // Refresh clears Main skill TTL; always re-project current Expert skills.
        const selectedSlug = valueRef.current.expertSlug;
        if (selectedSlug) {
          void loadSkills(selectedSlug, revision);
        } else if (reason === "refresh" || reason === "auth") {
          setSkills([]);
        }
      } catch (err) {
        if (!mountedRef.current || revision !== revisionRef.current) return;
        const mapped = mapHealthError(err);
        setError(healthErrorMessage(err, mapped));
        setCatalog([]);
        setEmptyCatalog(true);
      } finally {
        if (mountedRef.current && revision === revisionRef.current) {
          setRefreshing(false);
        }
      }
    },
    [bumpRevision, loadSkills, reconcileSelection, setStatus],
  );

  // Mount: revision 0→1 then first fetch when active.
  useEffect(() => {
    mountedRef.current = true;
    bumpRevision();
    if (active) {
      void loadHealthAndCatalog("mount");
    } else {
      dirtyWhileInactiveRef.current = true;
    }
    return () => {
      mountedRef.current = false;
      bumpRevision();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  // Auth identity change.
  useEffect(() => {
    if (authGenerationRef.current === authGeneration) return;
    authGenerationRef.current = authGeneration;
    if (!active) {
      dirtyWhileInactiveRef.current = true;
      setStatus("unknown");
      bumpRevision();
      return;
    }
    void loadHealthAndCatalog("auth");
  }, [active, authGeneration, bumpRevision, loadHealthAndCatalog, setStatus]);

  // active false→true: catch up.
  useEffect(() => {
    if (!active) return;
    if (dirtyWhileInactiveRef.current) {
      dirtyWhileInactiveRef.current = false;
      void loadHealthAndCatalog("activate");
    }
  }, [active, loadHealthAndCatalog]);

  // Window focus only when active.
  useEffect(() => {
    if (!active) return;
    const onFocus = (): void => {
      void loadHealthAndCatalog("focus");
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [active, loadHealthAndCatalog]);

  // Skills when expert changes.
  useEffect(() => {
    if (!value.expertSlug) {
      setSkills([]);
      setSkillsLoading(false);
      return;
    }
    const revision = bumpRevision();
    void loadSkills(value.expertSlug, revision);
  }, [bumpRevision, loadSkills, value.expertSlug]);

  // Callability projection.
  useEffect(() => {
    if (!value.expertSlug) {
      onSelectedCallabilityChange(null);
      return;
    }
    const catalogItem = catalog.find((item) => item.slug === value.expertSlug);
    const skillItem = value.skillName
      ? skills.find((item) => item.name === value.skillName)
      : undefined;
    if (!catalogItem || !skillItem) {
      onSelectedCallabilityChange({
        catalogStatus: catalogItem?.status ?? null,
        skillStatus: skillItem?.status ?? null,
        callEnabled: skillItem?.callEnabled === true,
        riskLevel: skillItem?.riskLevel ?? null,
        approvalMode: skillItem?.approvalMode ?? null,
        canSilentCall: false,
      });
      return;
    }
    onSelectedCallabilityChange({
      catalogStatus: catalogItem.status ?? null,
      skillStatus: skillItem.status ?? null,
      callEnabled: skillItem.callEnabled === true,
      riskLevel: skillItem.riskLevel ?? null,
      approvalMode: skillItem.approvalMode ?? null,
      canSilentCall: canSilentCallExpertSkill(catalogItem, skillItem),
    });
  }, [
    catalog,
    onSelectedCallabilityChange,
    skills,
    value.expertSlug,
    value.skillName,
  ]);

  // Density via toolbar ResizeObserver.
  useEffect(() => {
    const root = wrapRef.current;
    const toolbar = root?.closest(".chat-input-toolbar");
    if (!toolbar || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setDensity(densityFromWidth(width));
    });
    observer.observe(toolbar);
    setDensity(densityFromWidth(toolbar.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);

  const selectedExpert = value.expertSlug
    ? catalog.find((item) => item.slug === value.expertSlug)
    : undefined;
  const selectedSkill = value.skillName
    ? skills.find((item) => item.name === value.skillName)
    : undefined;

  const handleSelectionChange = (next: ExpertSelection): void => {
    if (next.expertSlug !== value.expertSlug) {
      bumpRevision();
    }
    onChange(next);
  };

  const silentCallHint = (() => {
    if (!value.expertSlug || !value.skillName) return null;
    if (!selectedExpert || !selectedSkill) {
      return describeSilentCallDenial({
        catalogStatus: selectedExpert?.status ?? null,
        skillStatus: selectedSkill?.status ?? null,
        callEnabled: selectedSkill?.callEnabled === true,
        riskLevel: selectedSkill?.riskLevel ?? null,
        approvalMode: selectedSkill?.approvalMode ?? null,
        canSilentCall: false,
      });
    }
    if (canSilentCallExpertSkill(selectedExpert, selectedSkill)) return null;
    return describeSilentCallDenial({
      catalogStatus: selectedExpert.status ?? null,
      skillStatus: selectedSkill.status ?? null,
      callEnabled: selectedSkill.callEnabled === true,
      riskLevel: selectedSkill.riskLevel ?? null,
      approvalMode: selectedSkill.approvalMode ?? null,
      canSilentCall: false,
    });
  })();

  return (
    <div className="expert-context-control" ref={wrapRef}>
      <WorkContextChip
        expertName={
          selectedExpert ? catalogLabel(selectedExpert) : value.expertSlug
        }
        skillName={selectedSkill ? skillLabel(selectedSkill) : value.skillName}
        gatewayStatus={gatewayStatus}
        density={density}
        open={open}
        onOpenChange={setOpen}
      >
        <WorkContextPopover
          gatewayStatusLabel={gatewayStatusLabel(gatewayStatus)}
          refreshing={refreshing}
          onClose={() => setOpen(false)}
          onClear={() => onChange({ expertSlug: null, skillName: null })}
          onRefresh={() => {
            void loadHealthAndCatalog("refresh");
          }}
        >
          {emptyCatalog ? (
            <p className="work-context-empty" role="status">
              No experts available. Catalog is empty or unavailable.
            </p>
          ) : (
            <ExpertSelector
              disabled={disabled}
              value={value}
              onChange={handleSelectionChange}
              catalog={catalog}
              skills={skills}
              skillsLoading={skillsLoading}
            />
          )}
          {silentCallHint ? (
            <p className="expert-selector-error" role="status">
              {silentCallHint}
            </p>
          ) : null}
          {error ? (
            <p className="expert-selector-error" role="status">
              {error}
            </p>
          ) : null}
        </WorkContextPopover>
      </WorkContextChip>
    </div>
  );
}
