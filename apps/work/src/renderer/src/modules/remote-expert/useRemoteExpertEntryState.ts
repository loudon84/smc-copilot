import { useCallback, useEffect, useRef, useState } from "react";
import {
  isRemoteExpertErrorCode,
  type RemoteExpertAvailability,
  type RemoteExpertCatalogItem,
  type RemoteExpertErrorCode,
  type RemoteExpertObsStage,
} from "../../../../shared/remote-expert";

export type AvailabilityStatus =
  | "checking"
  | "compatible"
  | "incompatible"
  | "unavailable";

export type CatalogStatus = "idle" | "loading" | "ready" | "empty" | "error";

export interface RemoteExpertEntryState {
  availabilityStatus: AvailabilityStatus;
  availability: RemoteExpertAvailability | null;
  catalogStatus: CatalogStatus;
  items: RemoteExpertCatalogItem[];
  catalogErrorCode?: string;
  catalogErrorMessage?: string;
  lastOperation?: {
    operationId: string;
    stage: RemoteExpertObsStage;
    status: "STARTED" | "PASS" | "FAIL";
    errorCode?: string;
  };
}

function mintOperationId(prefix: string): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function logUiOperation(record: {
  operationId: string;
  stage: RemoteExpertObsStage;
  status: "STARTED" | "PASS" | "FAIL";
  errorCode?: string;
}): void {
  console.info(
    "[remote-expert-ui]",
    JSON.stringify({
      operation_id: record.operationId,
      stage: record.stage,
      status: record.status,
      error_code: record.errorCode,
      timestamp: new Date().toISOString(),
    }),
  );
}

function mapAvailabilityResult(
  availability: RemoteExpertAvailability | null | undefined,
): {
  status: AvailabilityStatus;
  availability: RemoteExpertAvailability | null;
  errorCode?: string;
} {
  if (!availability) {
    return {
      status: "unavailable",
      availability: null,
      errorCode: "REMOTE_EXPERT_UI_AVAILABILITY_FAILED",
    };
  }
  if (availability.errorCode === "REMOTE_EXPERT_DISCOVERY_UNAVAILABLE") {
    return {
      status: "unavailable",
      availability,
      errorCode: availability.errorCode,
    };
  }
  if (
    availability.gateState === "INCOMPATIBLE" ||
    availability.errorCode === "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE" ||
    (availability.enabled === false &&
      availability.gateState !== "UNRESOLVED" &&
      availability.gateState !== "DISCOVERED")
  ) {
    return {
      status: "incompatible",
      availability,
      errorCode:
        availability.errorCode ?? "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE",
    };
  }
  if (availability.enabled && availability.gateState === "COMPATIBLE") {
    return { status: "compatible", availability };
  }
  if (
    availability.gateState === "UNRESOLVED" ||
    availability.gateState === "DISCOVERED" ||
    availability.enabled === false
  ) {
    return {
      status: "unavailable",
      availability,
      errorCode:
        availability.errorCode ?? "REMOTE_EXPERT_DISCOVERY_UNAVAILABLE",
    };
  }
  return {
    status: "unavailable",
    availability,
    errorCode:
      availability.errorCode ?? "REMOTE_EXPERT_UI_AVAILABILITY_FAILED",
  };
}

export function parseCatalogError(err: unknown): {
  code: RemoteExpertErrorCode;
  message: string;
} {
  const message = err instanceof Error ? err.message : String(err);
  const prefix = message.match(/^([A-Z0-9_]+):\s*(.*)$/);
  if (prefix && isRemoteExpertErrorCode(prefix[1])) {
    return { code: prefix[1], message: prefix[2] || message };
  }
  return {
    code: "REMOTE_EXPERT_CATALOG_UNAVAILABLE",
    message: message || "catalog unavailable",
  };
}

const INITIAL_STATE: RemoteExpertEntryState = {
  availabilityStatus: "checking",
  availability: null,
  catalogStatus: "idle",
  items: [],
};

export function useRemoteExpertEntryState(): RemoteExpertEntryState & {
  retryAvailability: () => void;
  refreshCatalog: () => void;
} {
  const [state, setState] = useState<RemoteExpertEntryState>(INITIAL_STATE);
  const availSeqRef = useRef(0);
  const catalogSeqRef = useRef(0);
  const availabilityStatusRef = useRef<AvailabilityStatus>("checking");

  useEffect(() => {
    availabilityStatusRef.current = state.availabilityStatus;
  }, [state.availabilityStatus]);

  const loadCatalog = useCallback(async (reason: "auto" | "refresh") => {
    if (availabilityStatusRef.current !== "compatible") {
      setState((prev) => ({
        ...prev,
        catalogStatus: "idle",
        catalogErrorCode: undefined,
        catalogErrorMessage: undefined,
      }));
      return;
    }
    const seq = ++catalogSeqRef.current;
    const operationId = mintOperationId(`catalog-${reason}`);
    logUiOperation({
      operationId,
      stage: "CATALOG",
      status: "STARTED",
    });
    setState((prev) => ({
      ...prev,
      catalogStatus: "loading",
      catalogErrorCode: undefined,
      catalogErrorMessage: undefined,
      lastOperation: {
        operationId,
        stage: "CATALOG",
        status: "STARTED",
      },
    }));
    try {
      const api = window.hermesAPI?.remoteExpert;
      if (!api?.listCatalog) {
        throw new Error(
          "REMOTE_EXPERT_CATALOG_UNAVAILABLE: catalog bridge unavailable",
        );
      }
      const list = await api.listCatalog();
      if (seq !== catalogSeqRef.current) return;
      const items = list.items ?? [];
      const catalogStatus: CatalogStatus =
        items.length > 0 ? "ready" : "empty";
      logUiOperation({
        operationId,
        stage: "CATALOG",
        status: "PASS",
      });
      setState((prev) => ({
        ...prev,
        catalogStatus,
        items,
        catalogErrorCode: undefined,
        catalogErrorMessage: undefined,
        lastOperation: {
          operationId,
          stage: "CATALOG",
          status: "PASS",
        },
      }));
    } catch (err) {
      if (seq !== catalogSeqRef.current) return;
      const parsed = parseCatalogError(err);
      logUiOperation({
        operationId,
        stage: "CATALOG",
        status: "FAIL",
        errorCode: parsed.code,
      });
      setState((prev) => ({
        ...prev,
        catalogStatus: "error",
        items: reason === "refresh" ? prev.items : [],
        catalogErrorCode: parsed.code,
        catalogErrorMessage: parsed.message,
        lastOperation: {
          operationId,
          stage: "CATALOG",
          status: "FAIL",
          errorCode: parsed.code,
        },
      }));
    }
  }, []);

  const checkAvailability = useCallback(async () => {
    const seq = ++availSeqRef.current;
    const operationId = mintOperationId("discover");
    logUiOperation({
      operationId,
      stage: "DISCOVER",
      status: "STARTED",
    });
    setState((prev) => ({
      ...prev,
      availabilityStatus: "checking",
      catalogStatus: "idle",
      lastOperation: {
        operationId,
        stage: "DISCOVER",
        status: "STARTED",
      },
    }));
    try {
      const api = window.hermesAPI?.remoteExpert;
      if (!api?.getAvailability) {
        throw new Error("REMOTE_EXPERT_UI_AVAILABILITY_FAILED");
      }
      const availability = await api.getAvailability();
      if (seq !== availSeqRef.current) return;
      const mapped = mapAvailabilityResult(availability);
      logUiOperation({
        operationId,
        stage: "DISCOVER",
        status: mapped.status === "compatible" ? "PASS" : "FAIL",
        errorCode: mapped.errorCode,
      });
      setState((prev) => ({
        ...prev,
        availabilityStatus: mapped.status,
        availability: mapped.availability,
        catalogStatus: mapped.status === "compatible" ? prev.catalogStatus : "idle",
        items: mapped.status === "compatible" ? prev.items : [],
        catalogErrorCode:
          mapped.status === "compatible" ? prev.catalogErrorCode : undefined,
        catalogErrorMessage:
          mapped.status === "compatible" ? prev.catalogErrorMessage : undefined,
        lastOperation: {
          operationId,
          stage: "DISCOVER",
          status: mapped.status === "compatible" ? "PASS" : "FAIL",
          errorCode: mapped.errorCode,
        },
      }));
      availabilityStatusRef.current = mapped.status;
      if (mapped.status === "compatible") {
        void loadCatalog("auto");
      }
    } catch {
      if (seq !== availSeqRef.current) return;
      logUiOperation({
        operationId,
        stage: "DISCOVER",
        status: "FAIL",
        errorCode: "REMOTE_EXPERT_UI_AVAILABILITY_FAILED",
      });
      availabilityStatusRef.current = "unavailable";
      setState((prev) => ({
        ...prev,
        availabilityStatus: "unavailable",
        availability: null,
        catalogStatus: "idle",
        items: [],
        catalogErrorCode: undefined,
        catalogErrorMessage: undefined,
        lastOperation: {
          operationId,
          stage: "DISCOVER",
          status: "FAIL",
          errorCode: "REMOTE_EXPERT_UI_AVAILABILITY_FAILED",
        },
      }));
    }
  }, [loadCatalog]);

  useEffect(() => {
    void checkAvailability();
  }, [checkAvailability]);

  return {
    ...state,
    retryAvailability: () => {
      void checkAvailability();
    },
    refreshCatalog: () => {
      void loadCatalog("refresh");
    },
  };
}
