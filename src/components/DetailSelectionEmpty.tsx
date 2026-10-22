import { FileText, Podcast } from "lucide-react";

export function DetailSelectionEmpty({ kind }: { kind: "article" | "podcast" | "notes" }) {
  const isPodcast = kind === "podcast";

  return (
    <div className="wreader-empty-detail">
      <div className="reader-feature-empty wreader-selection-empty">
        <div className="reader-feature-empty-preview" aria-hidden="true">
          <div className="reader-feature-empty-sheet">
            <div className="reader-feature-empty-sheet-heading">
              <span className="reader-feature-empty-icon">
                {isPodcast ? <Podcast /> : <FileText />}
              </span>
              <span className="reader-feature-empty-sheet-lines"><i /><i /></span>
            </div>
            <span className="reader-feature-empty-sheet-line" />
            <span className="reader-feature-empty-sheet-line" />
          </div>
        </div>
        <div className="reader-feature-empty-content">
          <h2>{isPodcast ? "选择一个节目查看详情" : kind === "notes" ? "从文章中摘录第一条笔记" : "选择一篇文章开始阅读"}</h2>
          <p>{isPodcast
            ? "从待播选择节目，播放与详情会显示在这里。"
            : kind === "notes" ? "打开文章或逐字稿，选中文字并选择「写笔记」。" : "从文章列表选择内容，正文与摘要会显示在这里。"}</p>
          {kind === "article" && (
            <div className="wreader-empty-shortcuts">
              快捷键 <kbd>J</kbd> <kbd>K</kbd> 切换文章 · <kbd>⌘K</kbd> 搜索
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
