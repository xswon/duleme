import React, { useEffect, useMemo, useState } from "react";
import type { AiConfig } from "../types";
import {
  DEFAULT_AI_CONFIG,
  getAiCapability,
  getAiConfig,
  getAiErrorMessage,
  getAiSecret,
  saveAiConfig,
  saveAiSecret,
  testAiConnection,
} from "../services/aiSettingsService";

type ProviderPreset = "openai" | "deepseek" | "qwen" | "kimi" | "ollama" | "custom";

const PROVIDER_PRESETS: Array<{
  id: ProviderPreset;
  name: string;
  baseURL: string;
  suggestedModel: string;
}> = [
  { id: "openai", name: "OpenAI", baseURL: "https://api.openai.com/v1", suggestedModel: "gpt-4o-mini" },
  { id: "deepseek", name: "DeepSeek", baseURL: "https://api.deepseek.com/v1", suggestedModel: "deepseek-chat" },
  { id: "qwen", name: "通义千问", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", suggestedModel: "qwen-plus" },
  { id: "kimi", name: "Kimi", baseURL: "https://api.moonshot.cn/v1", suggestedModel: "moonshot-v1-8k" },
  { id: "ollama", name: "Ollama", baseURL: "http://127.0.0.1:11434/v1", suggestedModel: "qwen2.5:7b" },
  { id: "custom", name: "自定义", baseURL: "", suggestedModel: "" },
];

function isLoopbackUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

export function LocalAiSettingsPanel() {
  const [config, setConfig] = useState<AiConfig>(DEFAULT_AI_CONFIG);
  const [apiKey, setApiKey] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [configuredModel, setConfiguredModel] = useState<string | undefined>();
  const [message, setMessage] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const preset = useMemo(
    () => PROVIDER_PRESETS.find((item) => item.id === config.providerPreset) || PROVIDER_PRESETS.at(-1)!,
    [config.providerPreset],
  );

  const refreshStatus = async () => {
    const capability = await getAiCapability();
    setConfiguredModel(capability.configured ? capability.model : undefined);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAiConfig(), getAiSecret(), getAiCapability()])
      .then(([storedConfig, secret, capability]) => {
        if (cancelled) return;
        setConfig(storedConfig);
        setApiKey(secret.apiKey);
        setConfiguredModel(capability.configured ? capability.model : undefined);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setMessage("AI 设置暂时无法读取。");
          setLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const updatePreset = (id: ProviderPreset) => {
    const next = PROVIDER_PRESETS.find((item) => item.id === id)!;
    setMessage("");
    setConfig((current) => ({
      ...current,
      providerPreset: id,
      baseURL: next.baseURL || current.baseURL,
      model: next.suggestedModel || current.model,
    }));
  };

  const validate = () => {
    if (!config.baseURL.trim()) return "请填写 Base URL。";
    try {
      const url = new URL(config.baseURL.trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") return "Base URL 仅支持 HTTP / HTTPS。";
    } catch {
      return "Base URL 格式不正确。";
    }
    if (!config.model.trim()) return "请填写模型名称。";
    if (!apiKey.trim() && !isLoopbackUrl(config.baseURL)) return "请填写 API Key。";
    return "";
  };

  const handleTest = async () => {
    const invalid = validate();
    if (invalid) {
      setMessage(invalid);
      return;
    }
    setTesting(true);
    setMessage("");
    try {
      const latencyMs = await testAiConnection(config, apiKey);
      setMessage(`连接成功 · ${latencyMs} ms`);
    } catch (error) {
      setMessage(getAiErrorMessage(error));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const invalid = validate();
    if (invalid) {
      setMessage(invalid);
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await Promise.all([
        saveAiConfig({ ...config, enabled: true, baseURL: config.baseURL.trim(), model: config.model.trim() }),
        saveAiSecret({ apiKey: apiKey.trim() }),
      ]);
      setConfig((current) => ({ ...current, enabled: true }));
      await refreshStatus();
      setMessage("设置已保存。");
    } catch {
      setMessage("设置保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async () => {
    setSaving(true);
    setMessage("");
    try {
      await saveAiConfig({ ...config, enabled: false });
      setConfig((current) => ({ ...current, enabled: false }));
      await refreshStatus();
      setMessage("内容智能已停用。");
    } catch {
      setMessage("设置保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="ai-settings-title" className="space-y-8">
      <div className="border-b border-slate-200 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="ai-settings-title" className="text-lg font-bold text-slate-900">AI 与转录</h2>
            <p className="mt-1.5 text-sm text-slate-500">内容智能与逐字稿分别配置，不影响基础阅读。</p>
          </div>
          <span className="text-xs text-slate-400">
            {loaded && configuredModel ? `已启用 · ${configuredModel}` : "未启用"}
          </span>
        </div>
      </div>

      <section aria-labelledby="content-ai-settings-title" className="space-y-5">
        <div>
          <h3 id="content-ai-settings-title" className="text-sm font-bold text-slate-900">内容智能</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">用于文章摘要等能力。支持 OpenAI-compatible API，也可以连接本机 Ollama / vLLM。</p>
        </div>

        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5">
          <label className="block text-sm font-semibold text-slate-700">
            服务
            <select
              value={(config.providerPreset as ProviderPreset) || "custom"}
              onChange={(event) => updatePreset(event.target.value as ProviderPreset)}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal text-slate-900 focus:border-blue-500 focus:outline-none"
            >
              {PROVIDER_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            Base URL
            <input
              value={config.baseURL}
              onChange={(event) => setConfig((current) => ({ ...current, baseURL: event.target.value }))}
              placeholder="https://api.openai.com/v1"
              spellCheck={false}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal text-slate-900 focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            API Key
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={isLoopbackUrl(config.baseURL) ? "本机服务可留空" : "输入你的 API Key"}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal text-slate-900 focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            Model
            <input
              value={config.model}
              onChange={(event) => setConfig((current) => ({ ...current, model: event.target.value }))}
              placeholder={preset.suggestedModel || "输入服务商提供的模型名称"}
              spellCheck={false}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal text-slate-900 focus:border-blue-500 focus:outline-none"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" disabled={testing || !loaded} onClick={handleTest} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {testing ? "正在测试…" : "测试连接"}
            </button>
            <button type="button" disabled={saving || !loaded} onClick={handleSave} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
              {saving ? "正在保存…" : "保存"}
            </button>
            {config.enabled && (
              <button type="button" disabled={saving} onClick={handleDisable} className="px-2 py-2 text-xs font-medium text-slate-500 hover:text-slate-800">
                停用
              </button>
            )}
          </div>
          {message && <p role="status" className="text-xs text-slate-600">{message}</p>}
          <p className="text-[11px] leading-5 text-slate-400">API Key 仅保存在当前浏览器的独立本地存储中，不包含在数据备份里。</p>
        </div>
      </section>

      <section aria-labelledby="transcription-settings-title" className="border-t border-slate-200 pt-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 id="transcription-settings-title" className="text-sm font-bold text-slate-900">逐字稿</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">本机 NextEcho 按需处理音频，与上面的文章摘要模型独立。</p>
          </div>
          <span className="text-xs text-slate-400">本机服务</span>
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
          <strong className="text-sm text-slate-800">NextEcho 本机转录</strong>
          <p className="mt-1 text-xs leading-5 text-slate-500">只有在你主动生成逐字稿时才会启动转录流程，不会自动调用文章摘要 API。</p>
        </div>
      </section>
    </section>
  );
}
