import React, { useState } from "react";

type TranscriptionMode = "cloud" | "local";
type CloudProvider = "aliyun" | "volcengine" | "openai" | "other";

const CLOUD_PROVIDERS: Array<{
  id: CloudProvider;
  name: string;
  description: string;
  modelName: string;
  modelId: string;
}> = [
  {
    id: "aliyun",
    name: "阿里云百炼",
    description: "适合中文播客与长音频",
    modelName: "Qwen Audio 3.0 ASR Flash · 文件转写",
    modelId: "qwen-audio-3.0-asr-flash-filetrans",
  },
  {
    id: "volcengine",
    name: "火山引擎",
    description: "适合中文长音频识别",
    modelName: "豆包大模型录音文件识别",
    modelId: "由 duleme 使用推荐版本",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "适合已有 OpenAI API 的用户",
    modelName: "OpenAI Transcription",
    modelId: "由 duleme 使用推荐版本",
  },
  {
    id: "other",
    name: "其他服务",
    description: "腾讯云或 OpenAI 兼容 API",
    modelName: "自定义转录模型",
    modelId: "在高级设置中指定",
  },
];

export function LocalAiSettingsPanel() {
  const [mode, setMode] = useState<TranscriptionMode>("cloud");
  const [provider, setProvider] = useState<CloudProvider | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [message, setMessage] = useState("");

  const selectedProvider = CLOUD_PROVIDERS.find((item) => item.id === provider) || null;

  return (
    <section aria-labelledby="ai-settings-title" className="space-y-8">
      <div className="border-b border-slate-200 pb-5">
        <h2 id="ai-settings-title" className="text-lg font-bold text-slate-900">AI 设置</h2>
        <p className="mt-1.5 text-sm text-slate-500">配置逐字稿生成和内容整理服务。默认尽量减少需要理解和选择的参数。</p>
      </div>

      <section aria-labelledby="transcription-settings-title" className="space-y-5">
        <div>
          <h3 id="transcription-settings-title" className="text-sm font-bold text-slate-900">逐字稿生成</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">先选择生成方式。模型由 duleme 推荐，完整模型 ID 会保留显示。</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => { setMode("cloud"); setMessage(""); }}
            className={`rounded-xl border p-4 text-left transition ${mode === "cloud" ? "border-blue-400 bg-blue-50/60 ring-1 ring-blue-200" : "border-slate-200 bg-white hover:border-slate-300"}`}
          >
            <div className="flex items-center justify-between gap-3">
              <strong className="text-sm text-slate-900">使用云端 API</strong>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">推荐</span>
            </div>
            <span className="mt-2 block text-xs leading-5 text-slate-500">无需安装模型，使用自己的 API Key。</span>
          </button>

          <button
            type="button"
            onClick={() => { setMode("local"); setMessage(""); }}
            className={`rounded-xl border p-4 text-left transition ${mode === "local" ? "border-blue-400 bg-blue-50/60 ring-1 ring-blue-200" : "border-slate-200 bg-white hover:border-slate-300"}`}
          >
            <strong className="text-sm text-slate-900">在本机生成</strong>
            <span className="mt-2 block text-xs leading-5 text-slate-500">音频在当前电脑处理，不需要云端 API Key。</span>
          </button>
        </div>

        {mode === "cloud" ? (
          <div className="space-y-5 rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5">
            <div>
              <div className="text-sm font-semibold text-slate-800">选择你的 API 服务商</div>
              <p className="mt-1 text-xs text-slate-500">只需选择你已经有 API Key 的服务。</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {CLOUD_PROVIDERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setProvider(item.id); setMessage(""); }}
                  className={`rounded-lg border px-3.5 py-3 text-left ${provider === item.id ? "border-blue-400 bg-white ring-1 ring-blue-200" : "border-slate-200 bg-white hover:border-slate-300"}`}
                >
                  <strong className="block text-sm text-slate-800">{item.name}</strong>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span>
                </button>
              ))}
            </div>

            {selectedProvider && (
              <div className="space-y-4 border-t border-slate-200 pt-4">
                <label className="block text-sm font-semibold text-slate-700">
                  API Key
                  <input
                    aria-label={`${selectedProvider.name} API Key`}
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="输入你的 API Key"
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                </label>

                <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-3">
                  <div className="text-xs font-medium text-slate-500">转录模型</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">{selectedProvider.modelName}</div>
                  <code className="mt-1 block break-all text-xs text-slate-500">{selectedProvider.modelId}</code>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdvanced((value) => !value)}
                  className="text-xs font-medium text-slate-500 hover:text-slate-800"
                  aria-expanded={showAdvanced}
                >
                  {showAdvanced ? "收起高级设置" : "高级设置"}
                </button>

                {showAdvanced && (
                  <div className="grid gap-3 rounded-lg border border-dashed border-slate-200 bg-white p-3 sm:grid-cols-2">
                    <label className="text-xs font-medium text-slate-600">服务地址<input placeholder="自动" className="mt-1.5 w-full rounded-md border border-slate-200 px-2.5 py-2 font-normal" /></label>
                    <label className="text-xs font-medium text-slate-600">模型 ID<input value={selectedProvider.modelId.includes("由 duleme") || selectedProvider.modelId.includes("高级设置") ? "" : selectedProvider.modelId} readOnly={selectedProvider.id !== "other"} placeholder="由 duleme 自动选择" className="mt-1.5 w-full rounded-md border border-slate-200 px-2.5 py-2 font-normal" /></label>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setMessage(apiKey.trim() ? "原型：连接测试成功。" : "请先填写 API Key。") } className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">测试连接</button>
                  <button type="button" onClick={() => setMessage(apiKey.trim() ? "原型：设置已保存。" : "请先填写 API Key。") } className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">保存设置</button>
                  <button type="button" className="ml-auto text-xs font-medium text-blue-600 hover:text-blue-700">还没有 API Key？查看获取方法 →</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <strong className="text-sm text-slate-900">本机转录服务</strong>
                <p className="mt-1 text-xs leading-5 text-slate-500">推荐安装适合中文播客的本机转录方案。duleme 会自动检测服务，不要求手动配置模型参数。</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => setMessage("原型：打开本机转录安装指南。") } className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">查看安装方法</button>
                <button type="button" onClick={() => setMessage("原型：未发现本机转录服务。") } className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">检测本机服务</button>
              </div>
            </div>
            <button type="button" className="mt-4 text-xs font-medium text-slate-500 hover:text-slate-800">已经有自己的本机服务？连接现有服务 →</button>
          </div>
        )}

        {message && <p role="status" className="text-xs text-slate-600">{message}</p>}
      </section>

      <section aria-labelledby="insight-settings-title" className="border-t border-slate-200 pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 id="insight-settings-title" className="text-sm font-bold text-slate-900">AI 整理</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">用于摘要、章节和内容洞察。与逐字稿服务独立配置。</p>
          </div>
          <button type="button" className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">配置 AI 整理</button>
        </div>
      </section>
    </section>
  );
}
