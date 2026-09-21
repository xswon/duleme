import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, Eye, EyeOff, KeyRound, X } from "lucide-react";
import { clearTranscriptionSettings, getTranscriptionSettings, saveTranscriptionSettings, type TranscriptionSettings } from "../services/dbService";
import {
  clearInsightSettings,
  getInsightSettingsStatus,
  listInsightModels,
  saveInsightSettings,
  testInsightSettings,
  type InsightModelOption,
  type InsightProviderId,
  type InsightSettingsStatus,
} from "../services/insightSettingsService";
import { transcriptionApi } from "../services/transcriptionService";
import "./LocalAiSettingsModal.css";

const TRANSCRIPTION_PROVIDERS = {
  aliyun: {
    name: "阿里云百炼",
    apiKeyUrl: "https://bailian.console.aliyun.com/?tab=model#/api-key",
    models: [{ id: "qwen-audio-3.0-asr-flash-filetrans", name: "Qwen Audio 3.0 ASR Flash Filetrans", description: "长音频转录" }],
  },
} as const;
type TranscriptionProviderId = keyof typeof TRANSCRIPTION_PROVIDERS;

const INSIGHT_PROVIDERS: Record<InsightProviderId, { name: string; baseURL: string }> = {
  openai: { name: "OpenAI", baseURL: "https://api.openai.com/v1" },
  deepseek: { name: "DeepSeek", baseURL: "https://api.deepseek.com" },
  qwen: { name: "通义千问", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  kimi: { name: "Kimi", baseURL: "https://api.moonshot.cn/v1" },
  ollama: { name: "Ollama", baseURL: "http://127.0.0.1:11434/v1" },
  custom: { name: "自定义", baseURL: "" },
};

const NON_CONTENT_MODEL_PATTERN = /(embedding|embed-|rerank|moderation|dall-e|image|tts|speech|whisper|transcrib|realtime|audio)/i;

function contentModelPriority(provider: "" | InsightProviderId, id: string): number {
  const value = id.toLowerCase();
  let score = 0;
  if (/latest$/.test(value)) score += 30;
  if (/(preview|experimental|\bexp\b)/.test(value)) score -= 20;
  if (/\d{4}[-_.]\d{2}[-_.]\d{2}/.test(value)) score -= 8;

  if (provider === "openai") {
    if (/^gpt-5(?:[.\-_]\d+)?$/.test(value)) score += 100;
    else if (/^gpt-5(?:[.\-_]\d+)?-(mini|nano)$/.test(value)) score += 80;
    else if (/^gpt-4[.\-_]?1(?:-(mini|nano))?$/.test(value)) score += 60;
  } else if (provider === "deepseek") {
    if (value === "deepseek-chat") score += 100;
    else if (value === "deepseek-reasoner") score += 70;
  } else if (provider === "qwen") {
    if (/qwen.*(plus|max|turbo|flash)/.test(value)) score += 80;
    else if (/qwen3/.test(value)) score += 60;
  } else if (provider === "kimi") {
    if (/kimi.*k2|kimi-latest/.test(value)) score += 90;
    else if (/moonshot/.test(value)) score += 60;
  } else if (provider === "ollama") {
    if (/:latest$/.test(value)) score += 30;
    if (/instruct/.test(value)) score += 20;
  }

  if (/(mini|flash|turbo)/.test(value)) score += 8;
  return score;
}

function pickContentModels(
  provider: "" | InsightProviderId,
  models: InsightModelOption[],
  currentModel: string,
): InsightModelOption[] {
  const current = currentModel.trim();
  const filtered = models
    .filter((model) => model.id === current || !NON_CONTENT_MODEL_PATTERN.test(model.id))
    .sort((a, b) => {
      const score = contentModelPriority(provider, b.id) - contentModelPriority(provider, a.id);
      if (score) return score;
      const created = (b.created || 0) - (a.created || 0);
      if (created) return created;
      return a.id.localeCompare(b.id);
    });

  const selected = filtered.find((model) => model.id === current);
  const shortlist = filtered.filter((model) => model.id !== current).slice(0, selected ? 5 : 6);
  return selected ? [selected, ...shortlist] : shortlist;
}

function isLoopbackUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

type Feedback = { tone: "success" | "error" | "warning" | "info"; text: string };

function ModelSummaryCard({ title, provider, onClick }: { title: string; provider?: string; onClick: () => void }) {
  return (
    <button type="button" className="wreader-model-summary-card" onClick={onClick}>
      <span>
        <strong>{title}</strong>
        {provider && <small>{provider} · 已连接</small>}
      </span>
      <ChevronRight aria-hidden="true" />
    </button>
  );
}

function ModelConfigModal({
  title,
  children,
  onClose,
  onSave,
  saveLabel = "保存",
  saving = false,
  footerStart,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSave: () => void;
  saveLabel?: string;
  saving?: boolean;
  footerStart?: React.ReactNode;
}) {
  return (
    <div className="wreader-model-modal" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="wreader-model-modal-backdrop" aria-label="关闭" onClick={onClose} />
      <section className="wreader-model-modal-card">
        <header>
          <h2>{title}</h2>
          <button type="button" aria-label="关闭" onClick={onClose}><X /></button>
        </header>
        <div className="wreader-model-modal-body">{children}</div>
        <footer>
          <div className="wreader-model-modal-footer-start">{footerStart}</div>
          <div className="wreader-model-modal-footer-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={saving}>取消</button>
            <button type="button" onClick={onSave} disabled={saving}>{saving ? "正在保存…" : saveLabel}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function ConnectionFeedback({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null;
  return (
    <p role="status" className={`wreader-model-feedback is-${feedback.tone}`}>
      {feedback.tone === "success" ? <CheckCircle2 /> : <AlertCircle />}
      {feedback.text}
    </p>
  );
}

export function LocalAiSettingsPanel({ view = "transcription", panelId }: { view?: "transcription" | "insight"; panelId: string }) {
  const [settings, setSettings] = useState<TranscriptionSettings | null>(null);
  const [language, setLanguage] = useState("auto");
  const [diarization, setDiarization] = useState(true);
  const [contextEnhancement, setContextEnhancement] = useState(true);
  const [transcriptionModalOpen, setTranscriptionModalOpen] = useState(false);
  const [draftTranscriptionProvider, setDraftTranscriptionProvider] = useState<"" | TranscriptionProviderId>("");
  const [draftKey, setDraftKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transcriptionFeedback, setTranscriptionFeedback] = useState<Feedback | null>(null);

  const [insight, setInsight] = useState<InsightSettingsStatus | null>(null);
  const [insightModalOpen, setInsightModalOpen] = useState(false);
  const [draftInsightProvider, setDraftInsightProvider] = useState<"" | InsightProviderId>("");
  const [draftInsightKey, setDraftInsightKey] = useState("");
  const [draftInsightBaseURL, setDraftInsightBaseURL] = useState("");
  const [draftInsightModel, setDraftInsightModel] = useState("");
  const [showInsightKey, setShowInsightKey] = useState(false);
  const [insightFeedback, setInsightFeedback] = useState<Feedback | null>(null);
  const [insightTesting, setInsightTesting] = useState(false);
  const [insightSaving, setInsightSaving] = useState(false);
  const [insightModels, setInsightModels] = useState<InsightModelOption[]>([]);
  const [insightModelsLoading, setInsightModelsLoading] = useState(false);
  const [insightModelsError, setInsightModelsError] = useState("");
  const [showInsightAdvanced, setShowInsightAdvanced] = useState(false);

  const loadTranscription = async () => {
    const value = await getTranscriptionSettings();
    setSettings(value);
    if (value) {
      setLanguage(value.language);
      setDiarization(value.diarization);
      setContextEnhancement(value.contextEnhancement);
    }
  };

  const loadInsight = async () => {
    try { setInsight(await getInsightSettingsStatus()); }
    catch { setInsight(null); }
  };

  useEffect(() => {
    if (view === "transcription") void loadTranscription();
    else void loadInsight();
  }, [view]);

  const updateOptions = async (next: Partial<Pick<TranscriptionSettings, "language" | "diarization" | "contextEnhancement">>) => {
    const nextValue = { language, diarization, contextEnhancement, ...next };
    setLanguage(nextValue.language);
    setDiarization(nextValue.diarization);
    setContextEnhancement(nextValue.contextEnhancement);
    if (!settings) return;
    const saved = { ...settings, ...nextValue };
    await saveTranscriptionSettings(saved);
    setSettings(saved);
  };

  const openTranscriptionModal = () => {
    setDraftTranscriptionProvider(settings?.provider || "");
    setDraftKey(settings?.apiKey || "");
    setShowKey(false);
    setTranscriptionFeedback(null);
    setTranscriptionModalOpen(true);
  };

  const changeTranscriptionProvider = (value: "" | TranscriptionProviderId) => {
    setDraftTranscriptionProvider(value);
    setDraftKey(value && value === settings?.provider ? settings.apiKey : "");
    setTranscriptionFeedback(null);
  };

  const testTranscription = async () => {
    if (!draftTranscriptionProvider) {
      setTranscriptionFeedback({ tone: "warning", text: "请先选择服务商。" });
      return;
    }
    if (!draftKey.trim()) {
      setTranscriptionFeedback({ tone: "warning", text: "请先填写 API Key。" });
      return;
    }
    setTesting(true);
    setTranscriptionFeedback({ tone: "info", text: "正在测试连接…" });
    try {
      await transcriptionApi.test(draftKey.trim());
      setTranscriptionFeedback({ tone: "success", text: "连接成功" });
    } catch (error: any) {
      setTranscriptionFeedback({ tone: "error", text: error.message || "连接失败，请检查 API Key。" });
    } finally {
      setTesting(false);
    }
  };

  const saveTranscription = async () => {
    if (!draftTranscriptionProvider) {
      setTranscriptionFeedback({ tone: "warning", text: "请先选择服务商。" });
      return;
    }
    if (!draftKey.trim()) {
      setTranscriptionFeedback({ tone: "warning", text: "请先填写 API Key。" });
      return;
    }
    setSaving(true);
    try {
      const next: TranscriptionSettings = {
        provider: draftTranscriptionProvider,
        apiKey: draftKey.trim(),
        language,
        diarization,
        contextEnhancement,
      };
      await saveTranscriptionSettings(next);
      setSettings(next);
      setTranscriptionModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const clearTranscription = async () => {
    setSaving(true);
    try {
      await clearTranscriptionSettings();
      setSettings(null);
      setDraftTranscriptionProvider("");
      setDraftKey("");
      setTranscriptionFeedback({ tone: "info", text: "已清除当前浏览器中的转录配置。" });
    } finally {
      setSaving(false);
    }
  };

  async function loadInsightModelCatalog({
    provider,
    baseURL,
    apiKey,
    currentModel,
    useEnvironment = false,
  }: {
    provider: "" | InsightProviderId;
    baseURL: string;
    apiKey: string;
    currentModel: string;
    useEnvironment?: boolean;
  }) {
    if (!provider || (!useEnvironment && !baseURL.trim())) return;
    setInsightModelsLoading(true);
    setInsightModelsError("");
    try {
      const models = await listInsightModels(useEnvironment ? undefined : {
        baseURL: baseURL.trim(),
        apiKey: apiKey.trim() || undefined,
      });
      setInsightModels(models);
      if (models.length === 0) {
        setInsightModelsError("服务商没有返回可用模型；你仍可在高级设置中手动填写模型名称。");
        return;
      }
      if (!currentModel.trim() && provider !== "custom") {
        const first = pickContentModels(provider, models, "")[0];
        if (first) setDraftInsightModel(first.id);
      }
    } catch {
      setInsightModels([]);
      setInsightModelsError("暂时无法自动获取模型列表；你仍可在高级设置中手动填写模型名称。");
    } finally {
      setInsightModelsLoading(false);
    }
  }

  const openInsightModal = () => {
    const nextProvider = insight?.source === "browser" ? insight.providerId : insight?.configured ? "custom" : "";
    const nextBaseURL = insight?.baseURL || (nextProvider ? INSIGHT_PROVIDERS[nextProvider].baseURL : "");
    const nextModel = insight?.model || "";
    setDraftInsightProvider(nextProvider);
    setDraftInsightBaseURL(nextBaseURL);
    setDraftInsightModel(nextModel);
    setDraftInsightKey("");
    setShowInsightKey(false);
    setInsightFeedback(null);
    setInsightModels([]);
    setInsightModelsError("");
    setShowInsightAdvanced(nextProvider === "custom");
    setInsightModalOpen(true);
    if (nextProvider && nextBaseURL) {
      void loadInsightModelCatalog({
        provider: nextProvider,
        baseURL: nextBaseURL,
        apiKey: "",
        currentModel: nextModel,
        useEnvironment: insight?.source === "server",
      });
    }
  };

  const changeInsightProvider = (value: "" | InsightProviderId) => {
    setDraftInsightProvider(value);
    setDraftInsightKey("");
    setInsightFeedback(null);
    setInsightModels([]);
    setInsightModelsError("");
    setShowInsightAdvanced(value === "custom");
    if (!value) {
      setDraftInsightBaseURL("");
      setDraftInsightModel("");
      return;
    }
    const preset = INSIGHT_PROVIDERS[value];
    setDraftInsightBaseURL(preset.baseURL);
    setDraftInsightModel("");
    if (value === "ollama") {
      void loadInsightModelCatalog({
        provider: value,
        baseURL: preset.baseURL,
        apiKey: "",
        currentModel: "",
      });
    }
  };

  const hasExistingInsightKey = Boolean(
    insight?.source === "browser" &&
    insight.hasApiKey &&
    insight.baseURL.trim().replace(/\/+$/, "") === draftInsightBaseURL.trim().replace(/\/+$/, ""),
  );

  const validateInsight = () => {
    if (!draftInsightProvider) return "请先选择服务商。";
    if (!draftInsightBaseURL.trim()) return "请填写 Base URL。";
    try {
      const url = new URL(draftInsightBaseURL.trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") return "Base URL 仅支持 HTTP / HTTPS。";
    } catch {
      return "Base URL 格式不正确。";
    }
    if (!draftInsightModel.trim()) return "请选择一个内容整理模型，或在高级设置中手动填写模型名称。";
    if (!isLoopbackUrl(draftInsightBaseURL) && !draftInsightKey.trim() && !hasExistingInsightKey) return "请填写 API Key。";
    return "";
  };

  const testInsight = async () => {
    const invalid = validateInsight();
    if (invalid) {
      setInsightFeedback({ tone: "warning", text: invalid });
      return;
    }
    setInsightTesting(true);
    setInsightFeedback({ tone: "info", text: "正在测试连接…" });
    try {
      const latencyMs = await testInsightSettings({
        provider: draftInsightProvider as InsightProviderId,
        baseURL: draftInsightBaseURL.trim(),
        apiKey: draftInsightKey.trim() || undefined,
        model: draftInsightModel.trim(),
      });
      setInsightFeedback({ tone: "success", text: `连接成功 · ${latencyMs} ms` });
    } catch (error: any) {
      setInsightFeedback({ tone: "error", text: error.message || "连接失败，请检查模型配置。" });
    } finally {
      setInsightTesting(false);
    }
  };

  const saveInsight = async () => {
    const invalid = validateInsight();
    if (invalid) {
      setInsightFeedback({ tone: "warning", text: invalid });
      return;
    }
    setInsightSaving(true);
    try {
      const status = await saveInsightSettings({
        provider: draftInsightProvider as InsightProviderId,
        baseURL: draftInsightBaseURL.trim(),
        apiKey: draftInsightKey.trim() || undefined,
        model: draftInsightModel.trim(),
      });
      setInsight(status);
      setInsightModalOpen(false);
    } catch (error: any) {
      setInsightFeedback({ tone: "error", text: error.message || "无法保存内容整理模型配置。" });
    } finally {
      setInsightSaving(false);
    }
  };

  const clearInsight = async () => {
    setInsightSaving(true);
    try {
      const status = await clearInsightSettings();
      setInsight(status);
      setDraftInsightKey("");
      setDraftInsightProvider(status.configured ? "custom" : "");
      setDraftInsightBaseURL(status.baseURL || "");
      setDraftInsightModel(status.model || "");
      setInsightModels([]);
      setInsightModelsError("");
      setShowInsightAdvanced(status.configured);
      setInsightFeedback(status.source === "server"
        ? { tone: "info", text: "已清除浏览器配置，当前使用环境变量配置。" }
        : { tone: "info", text: "已清除当前浏览器中的内容整理配置。" });
    } catch (error: any) {
      setInsightFeedback({ tone: "error", text: error.message || "无法清除内容整理模型配置。" });
    } finally {
      setInsightSaving(false);
    }
  };

  if (view === "insight") {
    const draftProvider = draftInsightProvider ? INSIGHT_PROVIDERS[draftInsightProvider] : null;
    const contentModels = pickContentModels(draftInsightProvider, insightModels, draftInsightModel);
    const sameAsServerEndpoint = Boolean(
      insight?.source === "server" &&
      insight.baseURL.trim().replace(/\/+$/, "") === draftInsightBaseURL.trim().replace(/\/+$/, ""),
    );
    const canLoadModels = Boolean(
      draftProvider &&
      draftInsightBaseURL.trim() &&
      (isLoopbackUrl(draftInsightBaseURL) || draftInsightKey.trim() || hasExistingInsightKey || sameAsServerEndpoint),
    );
    const refreshModels = () => loadInsightModelCatalog({
      provider: draftInsightProvider,
      baseURL: draftInsightBaseURL,
      apiKey: draftInsightKey,
      currentModel: draftInsightModel,
      useEnvironment: sameAsServerEndpoint && !draftInsightKey.trim(),
    });

    return (
      <section id={panelId} role="tabpanel" aria-labelledby="settings-tab-insight" className="wreader-ai-settings">
        <section className="wreader-model-settings-page">
          <h3>内容整理模型</h3>
          <ModelSummaryCard
            title={insight?.configured ? insight.model || "已配置" : "尚未配置"}
            provider={insight?.configured ? insight.provider : undefined}
            onClick={openInsightModal}
          />
          {insightModalOpen && (
            <ModelConfigModal
              title="配置内容整理模型"
              onClose={() => setInsightModalOpen(false)}
              onSave={() => void saveInsight()}
              saving={insightSaving}
              footerStart={(
                <div className="wreader-model-footer-tools">
                  <button type="button" className="wreader-model-test-button" onClick={() => void testInsight()} disabled={!draftProvider || insightTesting}>
                    {insightTesting ? "正在测试…" : "测试连接"}
                  </button>
                  <ConnectionFeedback feedback={insightFeedback} />
                </div>
              )}
            >
              <div className="wreader-model-field">
                <label htmlFor="insight-provider">服务商</label>
                <span className="wreader-ai-select-wrap">
                  <select
                    id="insight-provider"
                    value={draftInsightProvider}
                    onChange={(event) => changeInsightProvider(event.target.value as "" | InsightProviderId)}
                  >
                    <option value="">请选择</option>
                    {Object.entries(INSIGHT_PROVIDERS).map(([id, item]) => <option key={id} value={id}>{item.name}</option>)}
                  </select>
                  <ChevronDown aria-hidden="true" />
                </span>
              </div>

              <div className="wreader-model-field">
                <label htmlFor="insight-api-key">API Key</label>
                <div className="wreader-ai-key-field">
                  <KeyRound aria-hidden="true" />
                  <input
                    id="insight-api-key"
                    type={showInsightKey ? "text" : "password"}
                    autoComplete="off"
                    value={draftInsightKey}
                    disabled={!draftProvider}
                    onChange={(event) => {
                      setDraftInsightKey(event.target.value);
                      setInsightFeedback(null);
                      setInsightModels([]);
                      setInsightModelsError("");
                    }}
                    onBlur={() => {
                      if (canLoadModels && draftInsightKey.trim()) void refreshModels();
                    }}
                    placeholder={!draftProvider
                      ? "请先选择服务商"
                      : isLoopbackUrl(draftInsightBaseURL)
                        ? "本机服务可留空"
                        : hasExistingInsightKey
                          ? "已保存，如需更换请输入新的 API Key"
                          : "输入 API Key"}
                  />
                  <button type="button" onClick={() => setShowInsightKey(!showInsightKey)} aria-label={showInsightKey ? "隐藏 API Key" : "显示 API Key"} disabled={!draftProvider}>
                    {showInsightKey ? <EyeOff /> : <Eye />}
                  </button>
                </div>
                {draftProvider && !isLoopbackUrl(draftInsightBaseURL) && !draftInsightKey.trim() && !hasExistingInsightKey && !sameAsServerEndpoint && (
                  <p className="wreader-model-hint">填写 API Key 后会自动获取可用于内容整理的模型。</p>
                )}
              </div>

              <div className="wreader-model-field">
                <div className="wreader-model-label-row">
                  <label>内容整理模型</label>
                  <button type="button" onClick={() => void refreshModels()} disabled={!canLoadModels || insightModelsLoading}>
                    {insightModelsLoading ? "正在获取…" : insightModels.length ? "刷新" : "获取模型"}
                  </button>
                </div>

                {insightModelsLoading ? (
                  <div className="wreader-content-model-state" role="status">正在获取可用模型…</div>
                ) : contentModels.length > 0 ? (
                  <div className="wreader-content-model-choices" role="radiogroup" aria-label="内容整理模型">
                    {contentModels.map((model, index) => {
                      const selected = draftInsightModel === model.id;
                      const displayName = model.name && model.name !== model.id ? model.name : model.id;
                      return (
                        <label key={model.id} className={`wreader-content-model-choice ${selected ? "is-selected" : ""}`}>
                          <input
                            type="radio"
                            name="insight-model-choice"
                            value={model.id}
                            checked={selected}
                            onChange={() => { setDraftInsightModel(model.id); setInsightFeedback(null); }}
                          />
                          <span>
                            <strong>{displayName}</strong>
                            {model.name && model.name !== model.id && <small>{model.id}</small>}
                          </span>
                          {index === 0 && contentModelPriority(draftInsightProvider, model.id) > 0 && <em>常用</em>}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="wreader-content-model-state">
                    {!draftProvider
                      ? "先选择服务商。"
                      : canLoadModels
                        ? "点击“获取模型”自动选择；也可以在高级设置中手动填写。"
                        : "完成 API Key 配置后即可自动获取模型。"}
                  </div>
                )}
                {insightModelsError && <p className="wreader-model-catalog-warning">{insightModelsError}</p>}
              </div>

              <div className="wreader-model-advanced">
                <button
                  type="button"
                  className="wreader-model-advanced-toggle"
                  aria-expanded={showInsightAdvanced}
                  onClick={() => setShowInsightAdvanced((open) => !open)}
                  disabled={!draftProvider}
                >
                  高级设置
                  <ChevronDown aria-hidden="true" />
                </button>
                <div className="wreader-model-advanced-body" hidden={!showInsightAdvanced}>
                  <div className="wreader-model-field">
                    <label htmlFor="insight-base-url">Base URL</label>
                    <input
                      id="insight-base-url"
                      value={draftInsightBaseURL}
                      disabled={!draftProvider}
                      spellCheck={false}
                      placeholder={draftProvider ? "输入 OpenAI-compatible API 地址" : "请先选择服务商"}
                      onChange={(event) => {
                        setDraftInsightBaseURL(event.target.value);
                        setInsightFeedback(null);
                        setInsightModels([]);
                        setInsightModelsError("");
                      }}
                      onBlur={() => { if (canLoadModels) void refreshModels(); }}
                    />
                  </div>

                  <div className="wreader-model-field">
                    <label htmlFor="insight-model">手动模型名称</label>
                    <input
                      id="insight-model"
                      value={draftInsightModel}
                      disabled={!draftProvider}
                      spellCheck={false}
                      placeholder="仅在无法自动获取模型时需要填写"
                      onChange={(event) => { setDraftInsightModel(event.target.value); setInsightFeedback(null); }}
                    />
                  </div>
                </div>
              </div>

              {insight?.source === "server" && (
                <p className="wreader-model-hint">当前使用环境变量配置；保存后将优先使用此浏览器配置。</p>
              )}
              {insight?.source === "browser" && (
                <button type="button" className="wreader-model-clear-button" onClick={() => void clearInsight()} disabled={insightSaving}>清除浏览器配置</button>
              )}
            </ModelConfigModal>
          )}
        </section>
      </section>
    );
  }

  const provider = TRANSCRIPTION_PROVIDERS.aliyun;
  const model = provider.models[0];
  const draftProvider = draftTranscriptionProvider ? TRANSCRIPTION_PROVIDERS[draftTranscriptionProvider] : null;

  return (
    <section id={panelId} role="tabpanel" aria-labelledby="settings-tab-transcript" className="wreader-ai-settings">
      <section className="wreader-model-settings-page">
        <h3>转录模型</h3>
        <ModelSummaryCard
          title={settings ? model.name : "尚未配置"}
          provider={settings ? provider.name : undefined}
          onClick={openTranscriptionModal}
        />

        <section className="wreader-transcription-options-main" aria-labelledby="transcription-options-title">
          <h3 id="transcription-options-title">转录设置</h3>
          <div className="wreader-ai-control-card wreader-transcription-options">
            <div className="wreader-ai-setting-row">
              <span className="wreader-ai-setting-copy"><strong>语言</strong><small>通常无需手动指定</small></span>
              <span className="wreader-ai-setting-select">
                <select aria-label="转录语言" value={language} onChange={(event) => void updateOptions({ language: event.target.value })}>
                  <option value="auto">自动识别</option>
                  <option value="zh">中文</option>
                  <option value="en">英文</option>
                </select>
                <ChevronDown aria-hidden="true" />
              </span>
            </div>
            <label className="wreader-ai-setting-row">
              <span className="wreader-ai-setting-copy"><strong>区分说话人</strong><small>标记访谈中不同发言者</small></span>
              <span className="wreader-ai-switch"><input type="checkbox" checked={diarization} onChange={(event) => void updateOptions({ diarization: event.target.checked })} /><i aria-hidden="true" /></span>
            </label>
            <label className="wreader-ai-setting-row">
              <span className="wreader-ai-setting-copy"><strong>专有名词增强</strong><small>使用文章标题、播客名和节目简介提升识别</small></span>
              <span className="wreader-ai-switch"><input type="checkbox" checked={contextEnhancement} onChange={(event) => void updateOptions({ contextEnhancement: event.target.checked })} /><i aria-hidden="true" /></span>
            </label>
          </div>
        </section>

        {transcriptionModalOpen && (
          <ModelConfigModal
            title="配置转录模型"
            onClose={() => setTranscriptionModalOpen(false)}
            onSave={() => void saveTranscription()}
            saving={saving}
            footerStart={(
              <div className="wreader-model-footer-tools">
                <button type="button" className="wreader-model-test-button" onClick={() => void testTranscription()} disabled={!draftProvider || testing}>
                  {testing ? "正在测试…" : "测试连接"}
                </button>
                <ConnectionFeedback feedback={transcriptionFeedback} />
              </div>
            )}
          >
            <div className="wreader-model-field">
              <label htmlFor="ai-provider">服务商</label>
              <span className="wreader-ai-select-wrap">
                <select
                  id="ai-provider"
                  value={draftTranscriptionProvider}
                  onChange={(event) => changeTranscriptionProvider(event.target.value as "" | TranscriptionProviderId)}
                >
                  <option value="">请选择</option>
                  {Object.entries(TRANSCRIPTION_PROVIDERS).map(([id, item]) => <option key={id} value={id}>{item.name}</option>)}
                </select>
                <ChevronDown aria-hidden="true" />
              </span>
            </div>

            <div className="wreader-model-field">
              <label htmlFor="ai-api-key">API Key</label>
              <div className="wreader-ai-key-field">
                <KeyRound aria-hidden="true" />
                <input
                  id="ai-api-key"
                  type={showKey ? "text" : "password"}
                  autoComplete="off"
                  value={draftKey}
                  disabled={!draftProvider}
                  onChange={(event) => { setDraftKey(event.target.value); setTranscriptionFeedback(null); }}
                  placeholder={draftProvider ? `输入${draftProvider.name} API Key` : "请先选择服务商"}
                />
                <button type="button" onClick={() => setShowKey(!showKey)} aria-label={showKey ? "隐藏 API Key" : "显示 API Key"} disabled={!draftProvider}>
                  {showKey ? <EyeOff /> : <Eye />}
                </button>
              </div>
              <div className="wreader-model-key-actions">
                {draftProvider ? <a href={draftProvider.apiKeyUrl} target="_blank" rel="noreferrer">获取 API Key <ExternalLink /></a> : <span />}
              </div>
              {settings && draftTranscriptionProvider === settings.provider && (
                <button type="button" className="wreader-model-clear-button" onClick={() => void clearTranscription()} disabled={saving}>清除当前配置</button>
              )}
            </div>
          </ModelConfigModal>
        )}
      </section>
    </section>
  );
}
