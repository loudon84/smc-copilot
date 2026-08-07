import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Search, X } from "lucide-react";
import { PROVIDERS } from "../../../../constants";
import { useI18n } from "../../../../components/useI18n";
import BrandLogo from "../../../../components/common/BrandLogo";
import { detectProviderFromUrl } from "./detect-provider";
import { useDiscoveredModels } from "../../../../hooks/useDiscoveredModels";
import { hermesDefaultApi } from "../../api/hermesDefaultApi";
import { HERMES_DEFAULT_PROFILE } from "../../constants";

interface SavedModel {
  id: string;
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  apiKeyEnv?: string;
  apiKeyLiteral?: string;
  createdAt: number;
}

function inferApiKeyFields(baseUrl: string): { apiKeyEnv: string; apiKeyLiteral: string } {
  const url = baseUrl.trim().toLowerCase();
  if (url.includes("api.deepseek.com")) {
    return { apiKeyEnv: "DEEPSEEK_API_KEY", apiKeyLiteral: "" };
  }
  if (
    /localhost:11434|:11434/.test(url) ||
    /192\.168\.\d+\.\d+:11434/.test(url)
  ) {
    return { apiKeyEnv: "", apiKeyLiteral: "ollama" };
  }
  if (url.includes("api.groq.com")) return { apiKeyEnv: "GROQ_API_KEY", apiKeyLiteral: "" };
  if (url.includes("api.together.xyz")) {
    return { apiKeyEnv: "TOGETHER_API_KEY", apiKeyLiteral: "" };
  }
  if (url.includes("fireworks.ai")) {
    return { apiKeyEnv: "FIREWORKS_API_KEY", apiKeyLiteral: "" };
  }
  if (url.includes("cerebras.ai")) {
    return { apiKeyEnv: "CEREBRAS_API_KEY", apiKeyLiteral: "" };
  }
  if (url.includes("mistral.ai")) {
    return { apiKeyEnv: "MISTRAL_API_KEY", apiKeyLiteral: "" };
  }
  return { apiKeyEnv: "", apiKeyLiteral: "" };
}

function isDefaultModel(
  m: SavedModel,
  active: { provider: string; model: string } | null,
): boolean {
  if (!active?.model) return false;
  return m.provider === active.provider && m.model === active.model;
}

function providerLabelKey(value: string): string {
  return PROVIDERS.options.find((p) => p.value === value)?.label || value;
}

interface HermesDefaultModelsSurfaceProps {
  visible?: boolean;
}

function pageContent(
  loading: boolean,
  t: (key: string, options?: Record<string, unknown>) => string,
  children: React.ReactNode,
): React.JSX.Element {
  if (loading) {
    return (
      <div className="hermes-page">
        <div className="settings-container">
          <h1 className="settings-header">{t("models.title")}</h1>
          <div className="models-loading">
            <div className="loading-spinner" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="hermes-page">
      <div className="settings-container">{children}</div>
    </div>
  );
}

export function HermesDefaultModelsSurface({
  visible,
}: HermesDefaultModelsSurfaceProps = {}): React.JSX.Element {
  const { t } = useI18n();
  const [models, setModels] = useState<SavedModel[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingModel, setEditingModel] = useState<SavedModel | null>(null);
  const [formName, setFormName] = useState("");
  const [formProvider, setFormProvider] = useState("openrouter");
  const [formModel, setFormModel] = useState("");
  const [formBaseUrl, setFormBaseUrl] = useState("");
  const [formApiKey, setFormApiKey] = useState("");
  const [formApiKeyEnv, setFormApiKeyEnv] = useState("");
  const [formApiKeyLiteral, setFormApiKeyLiteral] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [formError, setFormError] = useState("");
  const [providerTouched, setProviderTouched] = useState(false);
  const [providerAutoFilled, setProviderAutoFilled] = useState(false);
  const [apiKeyAutoFilled, setApiKeyAutoFilled] = useState(false);
  const [activeConfig, setActiveConfig] = useState<{
    provider: string;
    model: string;
    baseUrl: string;
  } | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);

  function resolveCustomEnvKey(url: string): string {
    if (!url) return "CUSTOM_API_KEY";
    if (/openrouter\.ai/i.test(url)) return "OPENROUTER_API_KEY";
    if (/anthropic\.com/i.test(url)) return "ANTHROPIC_API_KEY";
    if (/openai\.com/i.test(url)) return "OPENAI_API_KEY";
    if (/huggingface\.co/i.test(url)) return "HF_TOKEN";
    if (/api\.groq\.com/i.test(url)) return "GROQ_API_KEY";
    if (/api\.deepseek\.com/i.test(url)) return "DEEPSEEK_API_KEY";
    if (/api\.together\.xyz/i.test(url)) return "TOGETHER_API_KEY";
    if (/api\.fireworks\.ai/i.test(url)) return "FIREWORKS_API_KEY";
    if (/api\.cerebras\.ai/i.test(url)) return "CEREBRAS_API_KEY";
    if (/api\.mistral\.ai/i.test(url)) return "MISTRAL_API_KEY";
    if (/api\.perplexity\.ai/i.test(url)) return "PERPLEXITY_API_KEY";
    return "CUSTOM_API_KEY";
  }

  const loadModels = useCallback(async () => {
    const [list, active] = await Promise.all([
      hermesDefaultApi.models.list(),
      hermesDefaultApi.models.getActive(),
    ]);
    setModels(list);
    setActiveConfig(active);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  useEffect(() => {
    if (visible) void loadModels();
  }, [visible, loadModels]);

  const isCustomForm = formProvider === "custom";
  const [discoveryRefresh, setDiscoveryRefresh] = useState(0);
  const discovery = useDiscoveredModels({
    provider: formProvider,
    baseUrl: isCustomForm ? formBaseUrl : undefined,
    apiKey: formApiKey || undefined,
    profile: HERMES_DEFAULT_PROFILE,
    enabled: showModal && formProvider !== "auto",
    refreshToken: discoveryRefresh,
  });
  const modelDiscoveryListId = "hermes-models-modal-discovery";

  function openAddModal(): void {
    setEditingModel(null);
    setFormName("");
    setFormProvider("openrouter");
    setFormModel("");
    setFormBaseUrl("");
    setFormApiKey("");
    setFormApiKeyEnv("");
    setFormApiKeyLiteral("");
    setShowApiKey(false);
    setFormError("");
    setProviderTouched(false);
    setProviderAutoFilled(false);
    setApiKeyAutoFilled(false);
    setShowModal(true);
  }

  function openEditModal(m: SavedModel): void {
    setEditingModel(m);
    setFormName(m.name);
    setFormProvider(m.provider);
    setFormModel(m.model);
    setFormBaseUrl(m.baseUrl);
    setFormApiKey("");
    setFormApiKeyEnv(m.apiKeyEnv ?? "");
    setFormApiKeyLiteral(m.apiKeyLiteral ?? "");
    setShowApiKey(false);
    setFormError("");
    setProviderTouched(true);
    setProviderAutoFilled(false);
    setApiKeyAutoFilled(false);
    setShowModal(true);
  }

  function closeModal(): void {
    setShowModal(false);
    setEditingModel(null);
    setFormError("");
    setProviderTouched(false);
    setProviderAutoFilled(false);
  }

  useEffect(() => {
    if (!showModal || providerTouched) {
      if (!showModal) setProviderAutoFilled(false);
      return;
    }
    const detected = detectProviderFromUrl(formBaseUrl);
    if (detected && detected !== formProvider) {
      setFormProvider(detected);
      setProviderAutoFilled(true);
    } else if (!detected && providerAutoFilled) {
      setProviderAutoFilled(false);
    }
  }, [formBaseUrl, showModal, providerTouched, formProvider, providerAutoFilled]);

  useEffect(() => {
    if (!showModal || apiKeyAutoFilled) return;
    const inferred = inferApiKeyFields(formBaseUrl);
    if (inferred.apiKeyEnv || inferred.apiKeyLiteral) {
      setFormApiKeyEnv(inferred.apiKeyEnv);
      setFormApiKeyLiteral(inferred.apiKeyLiteral);
      setApiKeyAutoFilled(true);
    }
  }, [formBaseUrl, showModal, apiKeyAutoFilled]);

  async function handleSave(): Promise<void> {
    const name = formName.trim();
    const model = formModel.trim();
    if (!name || !model) {
      setFormError(t("models.nameRequired"));
      return;
    }
    setFormError("");

    const keyOpts = {
      apiKeyEnv: formApiKeyEnv.trim() || undefined,
      apiKeyLiteral: formApiKeyLiteral.trim() || undefined,
    };

    if (editingModel) {
      await hermesDefaultApi.models.update(editingModel.id, {
        name,
        provider: formProvider,
        model,
        baseUrl: formBaseUrl.trim(),
        ...(keyOpts.apiKeyEnv ? { apiKeyEnv: keyOpts.apiKeyEnv } : { apiKeyEnv: "" }),
        ...(keyOpts.apiKeyLiteral
          ? { apiKeyLiteral: keyOpts.apiKeyLiteral }
          : { apiKeyLiteral: "" }),
      });
    } else {
      await hermesDefaultApi.models.add(
        name,
        formProvider,
        model,
        formBaseUrl.trim(),
        keyOpts,
      );
    }

    if (formApiKey.trim() && formProvider === "custom") {
      const envKey = resolveCustomEnvKey(formBaseUrl.trim());
      await hermesDefaultApi.providers.setEnv(envKey, formApiKey.trim());
    }

    closeModal();
    await loadModels();
  }

  async function handleDelete(id: string): Promise<void> {
    await hermesDefaultApi.models.remove(id);
    setConfirmDelete(null);
    await loadModels();
  }

  async function handleSetDefault(m: SavedModel): Promise<void> {
    setSettingDefaultId(m.id);
    try {
      await hermesDefaultApi.models.setDefault(m.id);
      await loadModels();
    } finally {
      setSettingDefaultId(null);
    }
  }

  const defaultModelMissing =
    Boolean(activeConfig?.model) &&
    !models.some(
      (m) => m.model === activeConfig?.model && m.provider === activeConfig?.provider,
    );

  const filtered = models.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      m.model.toLowerCase().includes(q) ||
      m.provider.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return pageContent(true, t, null);
  }

  return pageContent(
    false,
    t,
    <>
      <div className="models-header">
        <div>
          <h1 className="settings-header models-title-tight">{t("models.title")}</h1>
          <p className="models-subtitle">{t("models.subtitle")}</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={openAddModal}>
          <Plus size={14} />
          {t("models.addModel")}
        </button>
      </div>

      {defaultModelMissing ? (
        <div className="models-error" role="alert">
          Default model missing — select another model and click Set Default.
        </div>
      ) : null}

      {models.length > 0 && (
        <div className="models-search">
          <Search size={14} />
          <input
            className="models-search-input"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("models.searchPlaceholder")}
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="models-empty">
          {models.length === 0 ? (
            <>
              <p className="models-empty-text">{t("models.empty")}</p>
              <p className="models-empty-hint">{t("models.emptyHint")}</p>
            </>
          ) : (
            <p className="models-empty-text">{t("models.noMatch")}</p>
          )}
        </div>
      ) : (
        <div className="models-grid">
          {filtered.map((m) => (
            <div key={m.id} className="models-card" onClick={() => openEditModal(m)}>
              <div className="models-card-header">
                <div className="models-card-title">
                  <BrandLogo provider={m.provider} modelId={m.model} size={20} />
                  <div className="models-card-name">{m.name}</div>
                  {isDefaultModel(m, activeConfig) ? (
                    <span className="models-modal-auto-badge">Default</span>
                  ) : null}
                </div>
                <span className="models-card-provider">{t(providerLabelKey(m.provider))}</span>
              </div>
              <div className="models-card-model">{m.model}</div>
              {m.baseUrl ? <div className="models-card-url">{m.baseUrl}</div> : null}
              <div className="models-card-footer">
                {confirmDelete === m.id ? (
                  <div className="models-card-confirm" onClick={(e) => e.stopPropagation()}>
                    <span>{t("models.deleteConfirm")}</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger-text"
                      onClick={() => void handleDelete(m.id)}
                    >
                      {t("models.yes")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setConfirmDelete(null)}
                    >
                      {t("models.no")}
                    </button>
                  </div>
                ) : (
                  <>
                    {!isDefaultModel(m, activeConfig) ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={settingDefaultId === m.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleSetDefault(m);
                        }}
                      >
                        Set Default
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-ghost models-card-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(m.id);
                      }}
                      title={t("models.deleteModelTitle")}
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal ? (
        <div className="models-modal-overlay" onClick={closeModal}>
          <div className="models-modal" onClick={(e) => e.stopPropagation()}>
            <div className="models-modal-header">
              <h2 className="models-modal-title">
                {editingModel ? t("models.editModel") : t("models.addModel")}
              </h2>
              <button
                type="button"
                className="btn-ghost"
                onClick={closeModal}
                aria-label={t("common.close")}
                title={t("common.close")}
              >
                <X size={18} />
              </button>
            </div>

            <div className="models-modal-body">
              <div className="models-modal-field">
                <label className="models-modal-label">{t("models.displayName")}</label>
                <input
                  className="input"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t("models.namePlaceholder")}
                  autoFocus
                />
              </div>

              <div className="models-modal-field">
                <label className="models-modal-label" htmlFor="hermes-model-form-provider">
                  {t("common.provider")}
                  {providerAutoFilled && !providerTouched ? (
                    <span className="models-modal-auto-badge">
                      &nbsp;· auto-detected from base URL
                    </span>
                  ) : null}
                </label>
                <select
                  id="hermes-model-form-provider"
                  className="input"
                  value={formProvider}
                  onChange={(e) => {
                    setFormProvider(e.target.value);
                    setProviderTouched(true);
                    setProviderAutoFilled(false);
                  }}
                  aria-label={t("common.provider")}
                >
                  {PROVIDERS.options.map((p) => (
                    <option key={p.value} value={p.value}>
                      {t(p.label)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="models-modal-field">
                <label className="models-modal-label">{t("models.modelId")}</label>
                <div className="settings-model-row">
                  <input
                    className="input"
                    type="text"
                    value={formModel}
                    onChange={(e) => setFormModel(e.target.value)}
                    placeholder={t("models.modelIdPlaceholder")}
                    list={
                      discovery.models.length > 0 ? modelDiscoveryListId : undefined
                    }
                    autoComplete="off"
                  />
                  {discovery.status !== "unsupported" && discovery.status !== "idle" ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setDiscoveryRefresh((n) => n + 1)}
                      disabled={discovery.status === "loading"}
                      title={t("settings.refreshModels")}
                    >
                      ↻
                    </button>
                  ) : null}
                </div>
                {discovery.models.length > 0 ? (
                  <datalist id={modelDiscoveryListId}>
                    {discovery.models.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                ) : null}
                {discovery.status !== "idle" && discovery.status !== "unsupported" ? (
                  <span className="models-modal-hint">
                    {discovery.status === "loading"
                      ? t("settings.discoveringModels")
                      : discovery.status === "ok"
                        ? t("settings.discoveredCount", {
                            count: discovery.models.length,
                          })
                        : discovery.status === "no-key"
                          ? t("settings.discoveryNoKey")
                          : discovery.status === "error"
                            ? t("settings.discoveryError")
                            : ""}
                  </span>
                ) : null}
              </div>

              <div className="models-modal-field">
                <label className="models-modal-label">
                  {t("common.baseUrl")} ({t("common.optional")})
                </label>
                <input
                  className="input"
                  type="text"
                  value={formBaseUrl}
                  onChange={(e) => setFormBaseUrl(e.target.value)}
                  placeholder={t("models.baseUrlPlaceholder")}
                />
                <span className="models-modal-hint">{t("models.customProviderHint")}</span>
              </div>

              <div className="models-modal-field">
                <label className="models-modal-label">API Key Env ({t("common.optional")})</label>
                <input
                  className="input"
                  type="text"
                  value={formApiKeyEnv}
                  onChange={(e) => {
                    setFormApiKeyEnv(e.target.value);
                    setApiKeyAutoFilled(false);
                  }}
                  placeholder="DEEPSEEK_API_KEY"
                />
              </div>

              <div className="models-modal-field">
                <label className="models-modal-label">
                  API Key Literal ({t("common.optional")})
                </label>
                <input
                  className="input"
                  type="text"
                  value={formApiKeyLiteral}
                  onChange={(e) => {
                    setFormApiKeyLiteral(e.target.value);
                    setApiKeyAutoFilled(false);
                  }}
                  placeholder="ollama"
                />
              </div>

              {formProvider === "custom" ? (
                <div className="models-modal-field">
                  <label className="models-modal-label">
                    {t("models.apiKeyLabel")} ({t("common.optional")})
                  </label>
                  <div className="setup-input-group">
                    <input
                      className="input"
                      type={showApiKey ? "text" : "password"}
                      value={formApiKey}
                      onChange={(e) => setFormApiKey(e.target.value)}
                      placeholder="sk-..."
                    />
                    <button
                      type="button"
                      className="setup-toggle-visibility"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? t("common.hide") : t("common.show")}
                    </button>
                  </div>
                  <span className="models-modal-hint">{t("models.apiKeyHint")}</span>
                </div>
              ) : null}

              {formError ? <div className="models-error">{formError}</div> : null}
            </div>

            <div className="models-modal-footer">
              <button type="button" className="btn btn-secondary btn-sm" onClick={closeModal}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void handleSave()}
              >
                {editingModel ? t("models.update") : t("models.addModel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>,
  );
}
