import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ExternalLink, Eye, EyeOff, KeyRound, Sparkles } from "lucide-react";
import { clearTranscriptionSettings, getTranscriptionSettings, saveTranscriptionSettings } from "../services/dbService";
import { transcriptionApi } from "../services/transcriptionService";

const TRANSCRIPTION_PROVIDERS = {
  aliyun: {
    name: "阿里云百炼",
    modelName: "Qwen Audio 3.0 ASR Flash Filetrans",
    modelId: "qwen-audio-3.0-asr-flash-filetrans",
    modelDescription: "长音频转录",
  },
} as const;
type TranscriptionProvider = keyof typeof TRANSCRIPTION_PROVIDERS;

const keyPreview = (key: string) => key.length < 8 ? "已保存" : `${key.slice(0, 3)}••••${key.slice(-4)}`;

export function LocalAiSettingsPanel({ view = "transcription", panelId }: { view?: "transcription" | "insight"; panelId: string }) {
  const [apiKey, setApiKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [language, setLanguage] = useState("auto");
  const [diarization, setDiarization] = useState(true);
  const [contextEnhancement, setContextEnhancement] = useState(true);
  const [provider] = useState<TranscriptionProvider>("aliyun");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error" | "warning" | "info"; text: string } | null>(null);

  useEffect(() => {
    if (view !== "transcription") return;
    void getTranscriptionSettings()
      .then((value) => {
        if (!value) return;
        setSavedKey(value.apiKey);
        setLanguage(value.language);
        setDiarization(value.diarization);
        setContextEnhancement(value.contextEnhancement);
      })
      .catch(() => setFeedback({ tone: "error", text: "无法读取浏览器中的转录配置。" }));
  }, [view]);

  const selectedProvider = TRANSCRIPTION_PROVIDERS[provider];

  if (view === "insight") {
    return (
      <section id={panelId} role="tabpanel" aria-labelledby="settings-tab-insight" className="wreader-ai-settings">
        <section aria-label="内容整理">
          <div className="wreader-ai-section-heading">
            <div className="wreader-ai-section-icon"><Sparkles /></div>
            <p>内容整理的 DeepSeek 配置独立于逐字稿服务。</p>
          </div>
          <p className="text-sm text-slate-500">请继续使用现有内容整理配置；逐字稿 API Key 不会写入其中。</p>
        </section>
      </section>
    );
  }

  const saveAndTest = async () => {
    const nextKey = apiKey.trim() || savedKey;
    if (!nextKey) {
      setFeedback({ tone: "warning", text: "请先填写 API Key。" });
      return;
    }

    setBusy(true);
    setFeedback({ tone: "info", text: "正在验证阿里云百炼连接…" });
    try {
      await transcriptionApi.test(nextKey);
      await saveTranscriptionSettings({ provider: "aliyun", apiKey: nextKey, language, diarization, contextEnhancement });
      setSavedKey(nextKey);
      setApiKey("");
      setFeedback({ tone: "success", text: `API Key 已验证并保存 · ${keyPreview(nextKey)}` });
    } catch (error: any) {
      setFeedback({ tone: "error", text: error.message || "连接失败，请检查 API Key。" });
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await clearTranscriptionSettings();
      setSavedKey("");
      setApiKey("");
      setFeedback({ tone: "info", text: "已清除当前浏览器中的 API Key。" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id={panelId} role="tabpanel" aria-labelledby="settings-tab-transcript" className="wreader-ai-settings">
      <section aria-label="云端逐字稿" className="wreader-transcription-form">
        <section className="wreader-transcription-section" aria-labelledby="transcription-provider-title">
          <h3 id="transcription-provider-title">转录服务</h3>
          <div className="wreader-ai-control-card wreader-transcription-provider-card">
            <div className="wreader-ai-select-wrap">
              <select id="ai-provider" value={provider} disabled aria-label="转录服务">
                {Object.entries(TRANSCRIPTION_PROVIDERS).map(([id, item]) => <option key={id} value={id}>{item.name}</option>)}
              </select>
              <ChevronDown aria-hidden="true" />
            </div>
            <div className="wreader-transcription-model">
              <span>当前模型</span>
              <strong>{selectedProvider.modelName}</strong>
              <code>{selectedProvider.modelId}</code>
              <small>{selectedProvider.modelDescription}</small>
            </div>
          </div>
          <p className="wreader-ai-provider-note">更多转录服务将在后续版本提供</p>
        </section>

        <section className="wreader-transcription-section" aria-labelledby="transcription-key-title">
          <div className="wreader-transcription-section-heading">
            <h3 id="transcription-key-title">API Key</h3>
            <span>{savedKey ? `已连接 · ${keyPreview(savedKey)}` : "仅保存在当前浏览器中"}</span>
          </div>
          <div className="wreader-ai-control-card">
            <div className="wreader-ai-key-field">
              <KeyRound aria-hidden="true" />
              <input
                id="ai-api-key"
                type={showApiKey ? "text" : "password"}
                autoComplete="off"
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  setFeedback(null);
                }}
                placeholder={savedKey ? "输入新 Key 以更换" : "输入阿里云百炼 API Key"}
              />
              <button type="button" onClick={() => setShowApiKey(!showApiKey)} aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}>
                {showApiKey ? <EyeOff /> : <Eye />}
              </button>
            </div>
            <a
                className="wreader-transcription-key-help"
                href="https://bailian.console.aliyun.com/?tab=model#/api-key"
                target="_blank"
                rel="noreferrer"
              >
                获取 API Key <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </section>

        <section className="wreader-transcription-section" aria-labelledby="transcription-options-title">
          <h3 id="transcription-options-title">转录设置</h3>
          <div className="wreader-ai-control-card wreader-transcription-options">
            <div className="wreader-ai-advanced-panel">
              <div className="wreader-ai-setting-row">
                <span className="wreader-ai-setting-copy">
                  <strong>语言</strong>
                  <small>通常无需手动指定</small>
                </span>
                <span className="wreader-ai-setting-select">
                  <select aria-label="转录语言" value={language} onChange={(event) => setLanguage(event.target.value)}>
                    <option value="auto">自动识别</option>
                    <option value="zh">中文</option>
                    <option value="en">英文</option>
                  </select>
                  <ChevronDown aria-hidden="true" />
                </span>
              </div>
              <label className="wreader-ai-setting-row">
                <span className="wreader-ai-setting-copy">
                  <strong>区分说话人</strong>
                  <small>标记访谈中不同发言者</small>
                </span>
                <span className="wreader-ai-switch">
                  <input type="checkbox" checked={diarization} onChange={(event) => setDiarization(event.target.checked)} />
                  <i aria-hidden="true" />
                </span>
              </label>
              <label className="wreader-ai-setting-row">
                <span className="wreader-ai-setting-copy">
                  <strong>专有名词增强</strong>
                  <small>使用文章标题、播客名和节目简介提升识别</small>
                </span>
                <span className="wreader-ai-switch">
                  <input type="checkbox" checked={contextEnhancement} onChange={(event) => setContextEnhancement(event.target.checked)} />
                  <i aria-hidden="true" />
                </span>
              </label>
            </div>
          </div>
        </section>

        <div className="wreader-ai-actions wreader-transcription-actions">
          <div className="wreader-transcription-action-row">
            {savedKey && (
              <button type="button" className="secondary" disabled={busy} onClick={() => void clear()}>
                清除 Key
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => void saveAndTest()}>
              {busy ? "正在验证…" : savedKey && !apiKey ? "验证连接" : "验证并保存"}
            </button>
          </div>
        </div>

        {feedback && (
          <p role="status" className={`wreader-ai-feedback is-${feedback.tone}`}>
            {feedback.tone === "success" ? <CheckCircle2 /> : <AlertCircle />}
            {feedback.text}
          </p>
        )}
      </section>
    </section>
  );
}
