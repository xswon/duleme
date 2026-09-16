import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ExternalLink, Eye, EyeOff, KeyRound, Sparkles } from "lucide-react";
import { clearTranscriptionSettings, getTranscriptionSettings, saveTranscriptionSettings } from "../services/dbService";
import { transcriptionApi } from "../services/transcriptionService";

const TRANSCRIPTION_MODEL_NAME = "Qwen Audio 3.0 ASR Flash Filetrans";
const TRANSCRIPTION_MODEL_ID = "qwen-audio-3.0-asr-flash-filetrans";

const keyPreview = (key: string) => key.length < 8 ? "已保存" : `${key.slice(0, 3)}••••${key.slice(-4)}`;
const languageLabel = (language: string) => language === "zh" ? "中文" : language === "en" ? "英文" : "自动识别语言";

export function LocalAiSettingsPanel({ view = "transcription", panelId }: { view?: "transcription" | "insight"; panelId: string }) {
  const [apiKey, setApiKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [language, setLanguage] = useState("auto");
  const [diarization, setDiarization] = useState(true);
  const [contextEnhancement, setContextEnhancement] = useState(true);
  const [advanced, setAdvanced] = useState(false);
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

  const settingsSummary = useMemo(() => [
    languageLabel(language),
    diarization ? "区分说话人" : "不区分说话人",
    contextEnhancement ? "专有名词增强" : "未启用专有名词增强",
  ].join(" · "), [language, diarization, contextEnhancement]);

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
      <section aria-label="云端逐字稿">
        <div className="wreader-ai-form-row">
          <label htmlFor="ai-provider">
            <strong>转录服务</strong>
            <span>暂仅支持阿里云百炼</span>
          </label>
          <div className="wreader-ai-control-card">
            <div className="wreader-ai-select-wrap">
              <select id="ai-provider" value="aliyun" disabled>
                <option value="aliyun">阿里云百炼</option>
              </select>
              <ChevronDown aria-hidden="true" />
            </div>
            <p className="wreader-ai-provider-note">更多转录服务将在后续版本提供</p>

            <div className="wreader-ai-model-summary mt-3 border-t border-slate-100 pt-3">
              <span>转录模型</span>
              <strong>{TRANSCRIPTION_MODEL_NAME}</strong>
              <small>长音频转录</small>
            </div>
            <p className="-mt-2 truncate pl-[72px] font-mono text-[10px] text-slate-400" title={TRANSCRIPTION_MODEL_ID}>
              {TRANSCRIPTION_MODEL_ID}
            </p>
          </div>
        </div>

        <div className="wreader-ai-form-row is-key-row">
          <label htmlFor="ai-api-key">
            <strong>API Key</strong>
            <span>{savedKey ? `已连接 · ${keyPreview(savedKey)}` : "仅保存在当前浏览器中"}</span>
          </label>
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
            <div className="mt-2 flex items-center justify-between gap-3 px-0.5">
              <a
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#477fb9] hover:underline"
                href="https://bailian.console.aliyun.com/?tab=model#/api-key"
                target="_blank"
                rel="noreferrer"
              >
                获取 API Key <ExternalLink className="h-3 w-3" />
              </a>
              <span className="text-[10px] text-slate-400">用于连接上方所示转录模型</span>
            </div>
          </div>
        </div>

        <div className="wreader-ai-control-card wreader-ai-advanced-card">
          <button type="button" className="wreader-ai-advanced-toggle" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced}>
            <ChevronDown className={advanced ? "is-open" : ""} />
            <span className="ml-1 flex min-w-0 flex-1 items-center justify-between gap-3">
              <strong className="shrink-0 text-[12px] font-semibold text-[#445361]">转录设置</strong>
              <small className="truncate font-normal text-[#8796a5]">{settingsSummary}</small>
            </span>
          </button>

          {advanced && (
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
          )}
        </div>

        <div className="wreader-ai-actions is-end">
          <div>
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
