import type { Feed } from "../types";
import type { ArticleGenerationTask } from "../hooks/useArticleGenerationTasks";

interface ReaderFeedbackLayerProps {
  toast: { message: string; action?: { label: string; run: () => void } } | null;
  refreshFeedback: "success" | "partial" | "failure" | "retrying" | null;
  refreshState: { completed?: number; total?: number; failed: Feed[]; successful: number; newArticles: number };
  failureDetailsOpen: boolean;
  onFailureDetailsOpenChange: (open: boolean) => void;
  onDismissRefresh: () => void;
  onRetryFailed: () => void;
  onRetryFeed: (feedId: string) => void;
  generationTask?: ArticleGenerationTask | null;
  generationCount?: number;
  onViewGeneration?: (task: ArticleGenerationTask) => void;
  onDismissGeneration?: (articleId: string) => void;
}

function syncErrorLabel(message?: string): string {
  if (!message) return "未返回具体错误，可稍后重试";
  const normalized = message.toLowerCase();
  if (/timeout|timed out|abort|超时/.test(normalized)) return "请求超时，订阅源暂时没有响应";
  if (/\b429\b|too many|频繁|限流/.test(normalized)) return "订阅源请求过于频繁，请稍后再试";
  if (/\b(401|403)\b|forbidden|unauthorized|拒绝访问/.test(normalized)) return "订阅源拒绝访问";
  if (/\b(404|410)\b|not found|已失效/.test(normalized)) return "订阅地址不存在或已失效";
  if (/too large|15 mb|超过 15/.test(normalized)) return "订阅源文件过大";
  if (/invalid|parse|xml|无效数据|格式/.test(normalized)) return "订阅内容格式无效";
  if (/network|fetch|connect|enotfound|econn|dns|网络/.test(normalized)) return "网络连接失败";
  return message;
}

function lastSuccessLabel(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return `上次成功：${date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
}

export function ReaderFeedbackLayer({
  toast,
  refreshFeedback,
  refreshState,
  failureDetailsOpen,
  onFailureDetailsOpenChange,
  onDismissRefresh,
  onRetryFailed,
  onRetryFeed,
  generationTask,
  generationCount = 0,
  onViewGeneration,
  onDismissGeneration,
}: ReaderFeedbackLayerProps) {
  const backgroundRetryCount = refreshState.failed.filter((feed) => !!feed.nextSyncRetryAt).length;
  return <div className="wreader-toast-stack" aria-live="polite" aria-atomic="true">
    {toast && <div className="wreader-toast" role="status">
      <span>{toast.message}</span>
      {toast.action && <button type="button" onClick={toast.action.run} className="wreader-toast-action">{toast.action.label}</button>}
    </div>}
    {refreshFeedback && <section className={`wreader-toast wreader-refresh-feedback ${refreshFeedback === "failure" ? "is-error" : ""}`} role="status">
      {refreshFeedback === "success" ? <span>同步完成：已更新 {refreshState.successful} 个订阅源，发现 {refreshState.newArticles} 篇新内容。</span> : refreshFeedback === "retrying" ? <>
        <span>正在重试 {refreshState.completed ?? 0}/{refreshState.total ?? 0}</span>
        <button type="button" disabled>重试中…</button>
      </> : refreshFeedback === "partial" ? <>
        <span>已更新 {refreshState.successful} 个订阅源，{refreshState.failed.length} 个{backgroundRetryCount === refreshState.failed.length ? "将在后台重试" : "未能更新"}</span>
        <button type="button" onClick={() => onFailureDetailsOpenChange(!failureDetailsOpen)} aria-expanded={failureDetailsOpen}>{failureDetailsOpen ? "收起" : "查看"}</button>
        <button type="button" onClick={onRetryFailed}>重试</button>
        <button type="button" className="toast-close" onClick={onDismissRefresh} aria-label="关闭部分同步结果">关闭</button>
      </> : <>
        <span>{refreshState.failed.length} 个订阅源同步失败</span>
        <button type="button" onClick={() => onFailureDetailsOpenChange(!failureDetailsOpen)} aria-expanded={failureDetailsOpen}>{failureDetailsOpen ? "收起" : "查看"}</button>
        <button type="button" onClick={onRetryFailed}>重试</button>
        <button type="button" className="toast-close" onClick={onDismissRefresh} aria-label="关闭同步失败提示">关闭</button>
      </>}
    </section>}
    {generationTask && <section className={`wreader-toast wreader-generation-feedback ${generationTask.status === "failed" ? "is-error" : ""}`} role="status">
      <span>
        {generationTask.status === "failed"
          ? `《${generationTask.articleTitle}》的${generationTask.stage === "summarizing" ? "AI 摘要" : "逐字稿"}生成失败`
          : `正在生成《${generationTask.articleTitle}》的${generationTask.stage === "summarizing" ? "AI 摘要" : "逐字稿"}`}
        {generationTask.status === "processing" && typeof generationTask.progress === "number" ? ` · ${Math.round(generationTask.progress)}%` : ""}
        {generationTask.status === "processing" && generationCount > 1 ? ` · 另有 ${generationCount - 1} 项` : ""}
      </span>
      {onViewGeneration && <button type="button" onClick={() => onViewGeneration(generationTask)}>查看</button>}
      {generationTask.status === "failed" && onDismissGeneration && <button type="button" className="toast-close" onClick={() => onDismissGeneration(generationTask.articleId)} aria-label="关闭生成失败提示">关闭</button>}
    </section>}
    {(refreshFeedback === "failure" || refreshFeedback === "partial") && failureDetailsOpen && <section className="wreader-refresh-failure-panel" aria-label="刷新失败详情">
      <div className="wreader-failure-heading"><strong>刷新失败详情</strong><button type="button" onClick={() => onFailureDetailsOpenChange(false)} aria-label="关闭失败详情"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
      <p>以下订阅源未能更新，可逐个重试。</p>
      <div className="wreader-failure-list">{refreshState.failed.map((feed) => <div key={feed.id}><div className="wreader-failure-copy"><strong>{feed.title}</strong><small title={feed.lastSyncError}>{syncErrorLabel(feed.lastSyncError)}</small>{lastSuccessLabel(feed.lastUpdated) && <small>{lastSuccessLabel(feed.lastUpdated)}</small>}</div><button type="button" onClick={() => onRetryFeed(feed.id)}>重试</button></div>)}</div>
    </section>}
  </div>;
}
