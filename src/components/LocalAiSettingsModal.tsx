import React, { useEffect, useState } from "react";
import { localPodcastApi, type LocalAiSettings } from "../services/localPodcastService";

export function LocalAiSettingsPanel() {
  const [settings, setSettings] = useState<LocalAiSettings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setMessage("");
    void localPodcastApi.getSettings().then(setSettings).catch((error) => setMessage(error.message));
  }, []);

  const save = async () => {
    if (!settings || busy) return;
    setBusy(true); setMessage("");
    try {
      const saved = await localPodcastApi.saveSettings({ base_url: settings.base_url, model: settings.model, ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}) });
      setSettings(saved); setApiKey(""); setMessage("设置已保存。API Key 仅保存在 NextEcho 本机设置中。");
    } catch (error: any) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  const test = async () => {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const result = await localPodcastApi.testSettings();
      setMessage(result.ok ? "连接测试成功。" : result.error || "连接测试失败。");
    } catch (error: any) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  return (
    <section aria-labelledby="ai-settings-title" className="wreader-settings-ai">
        <div className="wreader-settings-ai-heading"><h2 id="ai-settings-title">AI 整理</h2><p>配置生成播客 AI 摘要时使用的服务。音频转录仍在本机完成。</p></div>
        {!settings ? <p className="py-8 text-center text-sm text-slate-500">正在连接 NextEcho…</p> : (
          <div className="wreader-settings-ai-fields">
            <label className="block text-sm font-semibold text-slate-700">服务地址<input aria-label="Base URL" value={settings.base_url} onChange={(e) => setSettings({ ...settings, base_url: e.target.value })} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal text-slate-900 focus:border-blue-500 focus:outline-none" /></label>
            <label className="block text-sm font-semibold text-slate-700">模型<input aria-label="模型" value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal text-slate-900 focus:border-blue-500 focus:outline-none" /></label>
            <label className="block text-sm font-semibold text-slate-700">API Key<input aria-label="API Key" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={settings.has_api_key ? `已配置 ${settings.api_key_preview}` : "尚未配置"} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal text-slate-900 focus:border-blue-500 focus:outline-none" /></label>
            <p className="wreader-settings-ai-status">状态：{settings.has_api_key ? `已配置（${settings.api_key_preview}）` : "未配置"}</p>
            <div className="wreader-settings-ai-actions"><button type="button" disabled={busy} onClick={test}>测试连接</button><button type="button" disabled={busy} onClick={save}>保存设置</button></div>
          </div>
        )}
        {message && <p className={`mt-4 text-sm ${message.includes("成功") || message.includes("已保存") ? "text-emerald-600" : "text-rose-600"}`} role="status">{message}</p>}
    </section>
  );
}
