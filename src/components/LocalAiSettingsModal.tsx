import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, Eye, EyeOff, Info, KeyRound, X } from "lucide-react";
import { clearTranscriptionSettings, getTranscriptionSettings, saveTranscriptionSettings, type TranscriptionSettings } from "../services/dbService";
import {
  clearInsightSettings,
  getInsightSettingsStatus,
  saveInsightSettings,
  testInsightSettings,
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

const INSIGHT_PROVIDERS: Record<InsightProviderId, { name: string; baseURL: string; suggestedModel: string }> = {
  openai: { name: "OpenAI", baseURL: "https://api.openai.com/v1", suggestedModel: "" },
  deepseek: { name: "DeepSeek", baseURL: "https://api.deepseek.com", suggestedModel: "" },
  qwen: { name: "通义千问", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", suggestedModel: "" },
  kimi: { name: "Kimi", baseURL: "https://api.moonshot.cn/v1", suggestedModel: "" },
  ollama: { name: "Ollama", baseURL: "http://127.0.0.1:11434/v1", suggestedModel: "" },
  custom: { name: "自定义", baseURL: "", suggestedModel: "" },
};

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
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSave: () => void;
  saveLabel?: string;
  saving?: boolean;
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
          <button type="button" className="secondary" onClick={onClose} disabled={saving}>取消</button>
          <button type="button" onClick={onSave} disabled={saving}>{saving ? "正在保存…" : saveLabel}</button>
        </footer>
      </section>
    </div>
  );
}

function ConnectionFeedback({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null;
  const FeedbackIcon = feedback.tone === "success" ? CheckCircle2 : feedback.tone === "info" ? Info : AlertCircle;
  return (
    <p role="status" aria-live="polite" aria-atomic="true" className={`wreader-model-feedback is-${feedback.tone}`}>
      <FeedbackIcon aria-hidden="true" />
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

  const openInsightModal = () => {
    setDraftInsightProvider(insight?.source === "browser" ? insight.providerId : insight?.configured ? "custom" : "");
    setDraftInsightBaseURL(insight?.baseURL || "");
    setDraftInsightModel(insight?.model || "");
    setDraftInsightKey("");
    setShowInsightKey(false);
    setInsightFeedback(null);
    setInsightModalOpen(true);
  };

  const changeInsightProvider = (value: "" | InsightProviderId) => {
    setDraftInsightProvider(value);
    setDraftInsightKey("");
    setInsightFeedback(null);
    if (!value) {
      setDraftInsightBaseURL("");
      setDraftInsightModel("");
      return;
    }
    const preset = INSIGHT_PROVIDERS[value];
    if (value !== "custom") setDraftInsightBaseURL(preset.baseURL);
    setDraftInsightModel(preset.suggestedModel);
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
    if (!draftInsightModel.trim()) return "请填写模型名称。";
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
            <ModelConfigModal title="配置内容整理模型" onClose={() => setInsightModalOpen(false)} onSave={() => void saveInsight()} saving={insightSaving}>
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
                <label htmlFor="insight-base-url">Base URL</label>
                <input
                  id="insight-base-url"
                  value={draftInsightBaseURL}
                  disabled={!draftProvider}
                  spellCheck={false}
                  placeholder={draftProvider ? "输入 OpenAI-compatible API 地址" : "请先选择服务商"}
                  onChange={(event) => { setDraftInsightBaseURL(event.target.value); setInsightFeedback(null); }}
                />
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
                    onChange={(event) => { setDraftInsightKey(event.target.value); setInsightFeedback(null); }}
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
              </div>

              <div className="wreader-model-field">
                <label htmlFor="insight-model">Model</label>
                <input
                  id="insight-model"
                  value={draftInsightModel}
                  disabled={!draftProvider}
                  spellCheck={false}
                  placeholder="输入服务商提供的模型名称"
                  onChange={(event) => { setDraftInsightModel(event.target.value); setInsightFeedback(null); }}
                />
                <div className="wreader-model-key-actions">
                  <span />
                  <button type="button" className="wreader-model-test-button" onClick={() => void testInsight()} disabled={!draftProvider || insightTesting}>
                    {insightTesting ? "正在测试…" : "测试连接"}
                  </button>
                </div>
                {insight?.source === "server" && <p>当前使用环境变量配置；保存后将优先使用此浏览器配置。</p>}
                {insight?.source === "browser" && (
                  <button type="button" className="wreader-model-clear-button" onClick={() => void clearInsight()} disabled={insightSaving}>清除浏览器配置</button>
                )}
              </div>
              <ConnectionFeedback feedback={insightFeedback} />
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
          <ModelConfigModal title="配置转录模型" onClose={() => setTranscriptionModalOpen(false)} onSave={() => void saveTranscription()} saving={saving}>
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
                <button type="button" className="wreader-model-test-button" onClick={() => void testTranscription()} disabled={!draftProvider || testing}>
                  {testing ? "正在测试…" : "测试连接"}
                </button>
              </div>
              {settings && draftTranscriptionProvider === settings.provider && (
                <button type="button" className="wreader-model-clear-button" onClick={() => void clearTranscription()} disabled={saving}>清除当前配置</button>
              )}
            </div>
            <ConnectionFeedback feedback={transcriptionFeedback} />
          </ModelConfigModal>
        )}
      </section>
    </section>
  );
}
