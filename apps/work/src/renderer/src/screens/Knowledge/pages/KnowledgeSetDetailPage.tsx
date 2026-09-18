import { useEffect, useMemo, useState, type ReactElement } from "react";
import { BusinessModuleUISurface } from "@/components/common/business-module-ui-surface";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "../../../components/useI18n";
import {
  useKnowledgeFacade,
  type UseKnowledgeFacadeOptions,
} from "../../../../../shared/knowledge/use-knowledge-facade";
import type {
  HermesKnowledgeBasesAPI,
  KnowledgeBaseSnapshot,
} from "../../../../../shared/knowledge/knowledge-base-ipc";
import type {
  HermesKnowledgeFacadeAPI,
  KnowledgeCapabilitySnapshot,
  KnowledgeModeSnapshot,
} from "../../../../../shared/knowledge/knowledge-job-ipc";
import {
  knowledgeSetActionAllowed,
  type HermesKnowledgeSetsAPI,
  type KnowledgeRetrievalProfileSnapshot,
  type KnowledgeRetrievalProfileStatus,
  type KnowledgeSetSnapshot,
  type KnowledgeSetStatus,
  type KnowledgeSetVisibility,
} from "../../../../../shared/knowledge/knowledge-set-ipc";
import type { KnowledgeRouteParams } from "../knowledge-route-descriptor";
import { KnowledgeLoading } from "../knowledge-page-chrome";

export type KnowledgeSetDetailPageProps = {
  params?: KnowledgeRouteParams;
  onNavigate?: (target: {
    page: string;
    params?: KnowledgeRouteParams;
  }) => void;
  onBack?: () => void;
  capability?: KnowledgeCapabilitySnapshot | null;
  mode?: KnowledgeModeSnapshot | null;
  facade?: HermesKnowledgeFacadeAPI | null;
  bases?: HermesKnowledgeBasesAPI | null;
  sets?: HermesKnowledgeSetsAPI | null;
};

type DetailLoadState =
  | "loading"
  | "unavailable"
  | "not-found"
  | "content"
  | "error";

type DetailTab = "info" | "bindings" | "retrieval" | "usage";

function errorCode(error: unknown): string {
  if (error instanceof Error) return error.message.split(/\s/)[0] ?? error.message;
  return "KNOWLEDGE_UNAVAILABLE";
}

function formatConfig(config: Record<string, unknown>): string {
  try {
    return JSON.stringify(config, null, 2);
  } catch {
    return "{}";
  }
}

export function KnowledgeSetDetailPage({
  params = {},
  onNavigate,
  onBack,
  capability: injectedCapability,
  mode: injectedMode,
  facade: injectedFacade,
  bases: injectedBases,
  sets: injectedSets,
}: KnowledgeSetDetailPageProps): ReactElement {
  const { t } = useI18n();
  const probe = useKnowledgeFacade({
    capability: injectedCapability,
    mode: injectedMode,
    facade: injectedFacade,
    bases: injectedBases,
    sets: injectedSets,
  } satisfies UseKnowledgeFacadeOptions);

  const knowledgeSetId = params.knowledgeSetId?.trim() ?? "";
  const [loadState, setLoadState] = useState<DetailLoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [detail, setDetail] = useState<KnowledgeSetSnapshot | null>(null);
  const [candidateBases, setCandidateBases] = useState<KnowledgeBaseSnapshot[]>(
    [],
  );
  const [profiles, setProfiles] = useState<KnowledgeRetrievalProfileSnapshot[]>(
    [],
  );
  const [tab, setTab] = useState<DetailTab>("info");
  const [submitting, setSubmitting] = useState(false);

  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftVisibility, setDraftVisibility] =
    useState<KnowledgeSetVisibility>("organization");
  const [draftStatus, setDraftStatus] = useState<KnowledgeSetStatus>("active");

  const [bindBaseId, setBindBaseId] = useState("");
  const [bindWeight, setBindWeight] = useState("1");
  const [rowWeights, setRowWeights] = useState<Record<string, string>>({});

  const [draftProfileConfig, setDraftProfileConfig] = useState("{}");
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editProfileConfig, setEditProfileConfig] = useState("{}");
  const [rollbackPublish, setRollbackPublish] = useState(false);
  const [configError, setConfigError] = useState("");

  const mutationsEnabled = probe.mutationsEnabled;
  const actionsAllowed =
    mutationsEnabled && knowledgeSetActionAllowed(detail?.status);

  const applyDetail = (snapshot: KnowledgeSetSnapshot): void => {
    setDetail(snapshot);
    setDraftName(snapshot.name);
    setDraftDescription(snapshot.description ?? "");
    setDraftVisibility(snapshot.visibility);
    setDraftStatus(snapshot.status);
    const weights: Record<string, string> = {};
    for (const bound of snapshot.knowledgeBases) {
      weights[bound.knowledgeBaseId] =
        bound.weight === undefined || bound.weight === null
          ? "1"
          : String(bound.weight);
    }
    setRowWeights(weights);
  };

  const refreshDetail = async (): Promise<void> => {
    if (!probe.sets || !knowledgeSetId) {
      setDetail(null);
      setLoadState(
        probe.presentation === "unavailable" ? "unavailable" : "not-found",
      );
      return;
    }
    const snapshot = await probe.sets.get({ knowledgeSetId });
    applyDetail(snapshot);
    setLoadState("content");
  };

  const refreshProfiles = async (): Promise<void> => {
    if (!probe.sets || !knowledgeSetId) {
      setProfiles([]);
      return;
    }
    const list = await probe.sets.listProfiles({ knowledgeSetId });
    setProfiles(list);
  };

  const refreshCandidates = async (): Promise<void> => {
    if (!probe.bases) {
      setCandidateBases([]);
      return;
    }
    const page = await probe.bases.list({ page: 1, pageSize: 100 });
    setCandidateBases(page.items);
  };

  useEffect(() => {
    if (probe.presentation === "loading") {
      setLoadState("loading");
      return;
    }
    if (probe.presentation === "unavailable") {
      setLoadState("unavailable");
      return;
    }
    if (!knowledgeSetId) {
      setLoadState("not-found");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await refreshDetail();
        await Promise.all([refreshProfiles(), refreshCandidates()]);
      } catch (error) {
        if (cancelled) return;
        const code = errorCode(error);
        if (code === "KNOWLEDGE_NOT_FOUND") {
          setLoadState("not-found");
          return;
        }
        setErrorMessage(code);
        setLoadState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh tied to probe + id
  }, [probe.presentation, probe.sets, probe.bases, knowledgeSetId]);

  const unboundCandidates = useMemo(() => {
    const bound = new Set(
      (detail?.knowledgeBases ?? []).map((item) => item.knowledgeBaseId),
    );
    return candidateBases.filter((item) => !bound.has(item.id));
  }, [candidateBases, detail]);

  const visibilityLabel = (value: KnowledgeSetVisibility): string => {
    if (value === "private") return t("knowledge.host.private");
    if (value === "department") return t("knowledge.host.department");
    return t("knowledge.host.organization");
  };

  const profileStatusLabel = (
    status: KnowledgeRetrievalProfileStatus,
  ): string => t(`knowledge.sets.profileStatus.${status}`);

  const handleSaveInfo = async (): Promise<void> => {
    if (!mutationsEnabled || !probe.sets || !detail || submitting) return;
    setSubmitting(true);
    try {
      const updated = await probe.sets.update({
        knowledgeSetId: detail.id,
        name: draftName.trim(),
        description: draftDescription.trim() ? draftDescription.trim() : null,
        visibility: draftVisibility,
        status: draftStatus,
      });
      applyDetail(updated);
    } catch (error) {
      setErrorMessage(errorCode(error));
      setLoadState("error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBind = async (): Promise<void> => {
    if (!actionsAllowed || !probe.sets || !detail || !bindBaseId || submitting) {
      return;
    }
    const weight = Number(bindWeight);
    setSubmitting(true);
    try {
      const updated = await probe.sets.bindBase({
        knowledgeSetId: detail.id,
        knowledgeBaseId: bindBaseId,
        weight: Number.isFinite(weight) ? weight : undefined,
      });
      applyDetail(updated);
      setBindBaseId("");
      setBindWeight("1");
    } catch (error) {
      setErrorMessage(errorCode(error));
      setLoadState("error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnbind = async (knowledgeBaseId: string): Promise<void> => {
    if (!actionsAllowed || !probe.sets || !detail || submitting) return;
    setSubmitting(true);
    try {
      const updated = await probe.sets.unbindBase({
        knowledgeSetId: detail.id,
        knowledgeBaseId,
      });
      applyDetail(updated);
    } catch (error) {
      setErrorMessage(errorCode(error));
      setLoadState("error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRebindWeight = async (knowledgeBaseId: string): Promise<void> => {
    if (!actionsAllowed || !probe.sets || !detail || submitting) return;
    const weight = Number(rowWeights[knowledgeBaseId] ?? "1");
    setSubmitting(true);
    try {
      await probe.sets.unbindBase({
        knowledgeSetId: detail.id,
        knowledgeBaseId,
      });
      const updated = await probe.sets.bindBase({
        knowledgeSetId: detail.id,
        knowledgeBaseId,
        weight: Number.isFinite(weight) ? weight : undefined,
      });
      applyDetail(updated);
    } catch (error) {
      setErrorMessage(errorCode(error));
      setLoadState("error");
    } finally {
      setSubmitting(false);
    }
  };

  const parseConfig = (raw: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        setConfigError(t("knowledge.sets.configInvalid"));
        return null;
      }
      setConfigError("");
      return parsed as Record<string, unknown>;
    } catch {
      setConfigError(t("knowledge.sets.configInvalid"));
      return null;
    }
  };

  const handleCreateProfile = async (): Promise<void> => {
    if (!actionsAllowed || !probe.sets || !detail || submitting) return;
    const config = parseConfig(draftProfileConfig);
    if (!config) return;
    setSubmitting(true);
    try {
      await probe.sets.createProfile({
        knowledgeSetId: detail.id,
        config,
      });
      setDraftProfileConfig("{}");
      await refreshProfiles();
    } catch (error) {
      setErrorMessage(errorCode(error));
      setLoadState("error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateProfile = async (): Promise<void> => {
    if (
      !actionsAllowed ||
      !probe.sets ||
      !editingProfileId ||
      submitting
    ) {
      return;
    }
    const config = parseConfig(editProfileConfig);
    if (!config) return;
    setSubmitting(true);
    try {
      await probe.sets.updateProfile({
        profileId: editingProfileId,
        config,
      });
      setEditingProfileId(null);
      await refreshProfiles();
    } catch (error) {
      setErrorMessage(errorCode(error));
      setLoadState("error");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePublishProfile = async (profileId: string): Promise<void> => {
    if (!actionsAllowed || !probe.sets || submitting) return;
    setSubmitting(true);
    try {
      await probe.sets.publishProfile({ profileId });
      await refreshProfiles();
    } catch (error) {
      setErrorMessage(errorCode(error));
      setLoadState("error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRollbackProfile = async (profileId: string): Promise<void> => {
    if (!actionsAllowed || !probe.sets || submitting) return;
    setSubmitting(true);
    try {
      await probe.sets.rollbackProfile({
        profileId,
        publish: rollbackPublish,
      });
      await refreshProfiles();
    } catch (error) {
      setErrorMessage(errorCode(error));
      setLoadState("error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BusinessModuleUISurface module="knowledge">
      <div data-testid="knowledge-set-detail" data-state={loadState}>
        {loadState === "loading" ? (
          <KnowledgeLoading label={t("knowledge.loading")} />
        ) : null}
        {loadState === "unavailable" ? (
          <EmptyState
            title={t("knowledge.unavailableTitle")}
            description={
              probe.capability?.status === "auth_required"
                ? t("knowledge.host.authRequired")
                : t("knowledge.unavailableDescription")
            }
          />
        ) : null}
        {loadState === "not-found" ? (
          <EmptyState
            title={t("knowledge.host.notFoundTitle")}
            description={t("knowledge.host.notFoundDescription")}
          />
        ) : null}
        {loadState === "error" ? (
          <EmptyState
            title={t("knowledge.host.errorTitle")}
            description={errorMessage}
          />
        ) : null}

        {loadState === "content" && detail ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {onBack ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-testid="knowledge-set-back"
                  onClick={onBack}
                >
                  {t("knowledge.host.back")}
                </Button>
              ) : null}
              <PageHeader
                title={detail.name}
                description={t("knowledge.sets.detailTitle")}
              />
              <Badge variant="outline">
                {t(`knowledge.sets.status.${detail.status}`)}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="knowledge-set-start-chat"
                onClick={() => onNavigate?.({ page: "chat" })}
              >
                {t("knowledge.sets.startChat")}
              </Button>
            </div>

            {!mutationsEnabled ? (
              <p>{t("knowledge.sets.mutateDisabled")}</p>
            ) : null}
            {mutationsEnabled && !knowledgeSetActionAllowed(detail.status) ? (
              <p>{t("knowledge.sets.disabledMutateHint")}</p>
            ) : null}

            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as DetailTab)}
            >
              <TabsList>
                <TabsTrigger value="info" data-testid="knowledge-set-tab-info">
                  {t("knowledge.sets.tabInfo")}
                </TabsTrigger>
                <TabsTrigger
                  value="bindings"
                  data-testid="knowledge-set-tab-bindings"
                >
                  {t("knowledge.sets.tabBindings")}
                </TabsTrigger>
                <TabsTrigger
                  value="retrieval"
                  data-testid="knowledge-set-tab-retrieval"
                >
                  {t("knowledge.sets.tabRetrieval")}
                </TabsTrigger>
                <TabsTrigger value="usage" data-testid="knowledge-set-tab-usage">
                  {t("knowledge.sets.tabUsage")}
                </TabsTrigger>
              </TabsList>

              <TabsContent
                forceMount
                value="info"
                data-testid="knowledge-set-info"
                hidden={tab !== "info"}
              >
                <div className="grid max-w-xl gap-3">
                  <div className="grid gap-1">
                    <Label htmlFor="knowledge-set-edit-name">
                      {t("knowledge.host.namePlaceholder")}
                    </Label>
                    <Input
                      id="knowledge-set-edit-name"
                      data-testid="knowledge-set-edit-name"
                      value={draftName}
                      disabled={
                        !mutationsEnabled ||
                        submitting ||
                        detail.status === "disabled"
                      }
                      onChange={(event) => setDraftName(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="knowledge-set-edit-description">
                      {t("knowledge.sets.descriptionLabel")}
                    </Label>
                    <Textarea
                      id="knowledge-set-edit-description"
                      data-testid="knowledge-set-edit-description"
                      value={draftDescription}
                      disabled={
                        !mutationsEnabled ||
                        submitting ||
                        detail.status === "disabled"
                      }
                      onChange={(event) =>
                        setDraftDescription(event.target.value)
                      }
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label>{t("knowledge.host.visibility")}</Label>
                    <Select
                      value={draftVisibility}
                      disabled={
                        !mutationsEnabled ||
                        submitting ||
                        detail.status === "disabled"
                      }
                      onValueChange={(value) =>
                        setDraftVisibility(value as KnowledgeSetVisibility)
                      }
                    >
                      <SelectTrigger data-testid="knowledge-set-edit-visibility">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="private">
                          {t("knowledge.host.private")}
                        </SelectItem>
                        <SelectItem value="department">
                          {t("knowledge.host.department")}
                        </SelectItem>
                        <SelectItem value="organization">
                          {t("knowledge.host.organization")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1">
                    <Label>{t("knowledge.sets.statusLabel")}</Label>
                    <Select
                      value={draftStatus}
                      disabled={!mutationsEnabled || submitting}
                      onValueChange={(value) =>
                        setDraftStatus(value as KnowledgeSetStatus)
                      }
                    >
                      <SelectTrigger data-testid="knowledge-set-edit-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">
                          {t("knowledge.sets.status.active")}
                        </SelectItem>
                        <SelectItem value="disabled">
                          {t("knowledge.sets.status.disabled")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {t("knowledge.host.owner")}: {detail.ownerMemberId ?? "—"}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {visibilityLabel(detail.visibility)}
                  </p>
                  <Button
                    type="button"
                    data-testid="knowledge-set-save-info"
                    disabled={
                      !mutationsEnabled || submitting || !draftName.trim()
                    }
                    onClick={() => {
                      void handleSaveInfo();
                    }}
                  >
                    {t("knowledge.host.save")}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent
                forceMount
                value="bindings"
                data-testid="knowledge-set-bindings"
                hidden={tab !== "bindings"}
              >
                <div className="grid gap-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="grid min-w-[12rem] flex-1 gap-1">
                      <Label htmlFor="knowledge-set-bind-base">
                        {t("knowledge.sets.bindBaseLabel")}
                      </Label>
                      <select
                        id="knowledge-set-bind-base"
                        data-testid="knowledge-set-bind-base"
                        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                        value={bindBaseId}
                        disabled={
                          !actionsAllowed ||
                          submitting ||
                          unboundCandidates.length === 0
                        }
                        onChange={(event) => setBindBaseId(event.target.value)}
                      >
                        <option value="">
                          {t("knowledge.sets.bindBasePlaceholder")}
                        </option>
                        {unboundCandidates.map((base) => (
                          <option key={base.id} value={base.id}>
                            {base.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid w-28 gap-1">
                      <Label htmlFor="knowledge-set-bind-weight">
                        {t("knowledge.sets.weightLabel")}
                      </Label>
                      <Input
                        id="knowledge-set-bind-weight"
                        data-testid="knowledge-set-bind-weight"
                        value={bindWeight}
                        disabled={!actionsAllowed || submitting}
                        onChange={(event) => setBindWeight(event.target.value)}
                      />
                    </div>
                    <Button
                      type="button"
                      data-testid="knowledge-set-bind"
                      disabled={
                        !actionsAllowed || submitting || !bindBaseId
                      }
                      onClick={() => {
                        void handleBind();
                      }}
                    >
                      {t("knowledge.sets.bindAction")}
                    </Button>
                  </div>
                  {candidateBases.length === 0 ? (
                    <p>{t("knowledge.sets.noBases")}</p>
                  ) : null}
                  {detail.knowledgeBases.length === 0 ? (
                    <p data-testid="knowledge-set-bindings-empty">
                      {t("knowledge.sets.bindingsEmpty")}
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("knowledge.sets.boundBases")}</TableHead>
                          <TableHead>{t("knowledge.sets.weightLabel")}</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.knowledgeBases.map((bound) => (
                          <TableRow
                            key={bound.knowledgeBaseId}
                            data-testid={`knowledge-set-bound-${bound.knowledgeBaseId}`}
                          >
                            <TableCell>
                              {bound.name ?? bound.knowledgeBaseId}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Input
                                  className="w-24"
                                  data-testid={`knowledge-set-weight-${bound.knowledgeBaseId}`}
                                  value={
                                    rowWeights[bound.knowledgeBaseId] ?? "1"
                                  }
                                  disabled={!actionsAllowed || submitting}
                                  onChange={(event) =>
                                    setRowWeights((prev) => ({
                                      ...prev,
                                      [bound.knowledgeBaseId]: event.target.value,
                                    }))
                                  }
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  data-testid={`knowledge-set-weight-save-${bound.knowledgeBaseId}`}
                                  disabled={!actionsAllowed || submitting}
                                  onClick={() => {
                                    void handleRebindWeight(bound.knowledgeBaseId);
                                  }}
                                >
                                  {t("knowledge.host.save")}
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                data-testid={`knowledge-set-unbind-${bound.knowledgeBaseId}`}
                                disabled={!actionsAllowed || submitting}
                                onClick={() => {
                                  void handleUnbind(bound.knowledgeBaseId);
                                }}
                              >
                                {t("knowledge.sets.unbindAction")}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </TabsContent>

              <TabsContent
                forceMount
                value="retrieval"
                data-testid="knowledge-set-retrieval"
                hidden={tab !== "retrieval"}
              >
                <div className="grid gap-4">
                  <div className="grid max-w-2xl gap-2">
                    <Label htmlFor="knowledge-set-profile-create-config">
                      {t("knowledge.sets.profileConfigLabel")}
                    </Label>
                    <Textarea
                      id="knowledge-set-profile-create-config"
                      data-testid="knowledge-set-profile-create-config"
                      className="min-h-28 font-mono text-sm"
                      value={draftProfileConfig}
                      disabled={!actionsAllowed || submitting}
                      onChange={(event) =>
                        setDraftProfileConfig(event.target.value)
                      }
                    />
                    {configError && !editingProfileId ? (
                      <p className="text-destructive text-sm">{configError}</p>
                    ) : null}
                    <Button
                      type="button"
                      className="w-fit"
                      data-testid="knowledge-set-profile-create"
                      disabled={!actionsAllowed || submitting}
                      onClick={() => {
                        void handleCreateProfile();
                      }}
                    >
                      {t("knowledge.sets.createProfile")}
                    </Button>
                  </div>

                  <label className="flex w-fit items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      data-testid="knowledge-set-rollback-publish"
                      checked={rollbackPublish}
                      disabled={!actionsAllowed || submitting}
                      onChange={(event) =>
                        setRollbackPublish(event.target.checked)
                      }
                    />
                    {t("knowledge.sets.rollbackPublish")}
                  </label>

                  {profiles.length === 0 ? (
                    <p data-testid="knowledge-set-profiles-empty">
                      {t("knowledge.sets.profilesEmpty")}
                    </p>
                  ) : (
                    <Table data-testid="knowledge-set-profiles">
                      <TableHeader>
                        <TableRow>
                          <TableHead>
                            {t("knowledge.sets.profileVersion")}
                          </TableHead>
                          <TableHead>
                            {t("knowledge.sets.profileStatusLabel")}
                          </TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {profiles.map((profile) => (
                          <TableRow
                            key={profile.id}
                            data-testid={`knowledge-set-profile-${profile.id}`}
                          >
                            <TableCell>v{profile.version}</TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {profileStatusLabel(profile.status)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-2">
                                {profile.status === "draft" ? (
                                  <>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      data-testid={`knowledge-set-profile-edit-${profile.id}`}
                                      disabled={!actionsAllowed || submitting}
                                      onClick={() => {
                                        setEditingProfileId(profile.id);
                                        setEditProfileConfig(
                                          formatConfig(profile.config),
                                        );
                                        setConfigError("");
                                      }}
                                    >
                                      {t("knowledge.sets.editProfile")}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      data-testid={`knowledge-set-profile-publish-${profile.id}`}
                                      disabled={!actionsAllowed || submitting}
                                      onClick={() => {
                                        void handlePublishProfile(profile.id);
                                      }}
                                    >
                                      {t("knowledge.sets.publishProfile")}
                                    </Button>
                                  </>
                                ) : null}
                                {profile.status === "active" ||
                                profile.status === "archived" ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    data-testid={`knowledge-set-profile-rollback-${profile.id}`}
                                    disabled={!actionsAllowed || submitting}
                                    onClick={() => {
                                      void handleRollbackProfile(profile.id);
                                    }}
                                  >
                                    {t("knowledge.sets.rollbackProfile")}
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}

                  {editingProfileId ? (
                    <div className="grid max-w-2xl gap-2">
                      <Label htmlFor="knowledge-set-profile-edit-config">
                        {t("knowledge.sets.profileConfigLabel")}
                      </Label>
                      <Textarea
                        id="knowledge-set-profile-edit-config"
                        data-testid="knowledge-set-profile-edit-config"
                        className="min-h-28 font-mono text-sm"
                        value={editProfileConfig}
                        disabled={!actionsAllowed || submitting}
                        onChange={(event) =>
                          setEditProfileConfig(event.target.value)
                        }
                      />
                      {configError ? (
                        <p className="text-destructive text-sm">{configError}</p>
                      ) : null}
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          data-testid="knowledge-set-profile-save"
                          disabled={!actionsAllowed || submitting}
                          onClick={() => {
                            void handleUpdateProfile();
                          }}
                        >
                          {t("knowledge.host.save")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={submitting}
                          onClick={() => {
                            setEditingProfileId(null);
                            setConfigError("");
                          }}
                        >
                          {t("knowledge.host.cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </TabsContent>

              <TabsContent
                forceMount
                value="usage"
                data-testid="knowledge-set-usage"
                hidden={tab !== "usage"}
              >
                {detail.usageCount <= 0 && !detail.lastUsedAt ? (
                  <p data-testid="knowledge-set-usage-empty">
                    {t("knowledge.sets.usageEmpty")}
                  </p>
                ) : (
                  <div className="grid gap-1 text-sm">
                    <p data-testid="knowledge-set-usage-count">
                      {t("knowledge.sets.usageCount")}: {detail.usageCount}
                    </p>
                    <p data-testid="knowledge-set-usage-last">
                      {t("knowledge.sets.lastUsedAt")}:{" "}
                      {detail.lastUsedAt ?? "—"}
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        ) : null}
      </div>
    </BusinessModuleUISurface>
  );
}

export default KnowledgeSetDetailPage;
