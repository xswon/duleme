import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import {
  ExternalLink,
  Star,
  Mail,
  MailOpen,
  FileText,
  Sparkle,
  MessageSquareText,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Maximize2,
  Minimize2,
  Menu,
  AudioLines,
} from "lucide-react";
import { Article, ArticleNote, DetailTab } from "../types";
import { resolveImageUrl } from "./ArticleList";
import { summarizeArticleWithAI } from "../services/rssService";
import { useBidclubEpisode } from "../hooks/useBidclubEpisode";
import type { SharedAudioPlayer } from "../hooks/useAudioPlayer";
import { useLocalPodcast } from "../hooks/useLocalPodcast";
import { AudioPlayerCard } from "./AudioPlayerCard";
import { ArticleInsightTabs } from "./ArticleInsightTabs";
import { ArticleNotesTab } from "./ArticleNotesTab";
import {
  deleteArticleNoteFromDB,
  getArticleNotesFromDB,
  saveArticleNoteToDB,
} from "../services/dbService";
import { resolveArticlePresentation } from "../services/articlePresentation";
import {
  normalizeDetailPresentation,
  resolveArticleDefaultTab,
  resolveDetailTab,
} from "./detailTabState";
import {
  hasBidclubEnrichment,
  isVerifiedBidclubEnrichment,
  resolveBidclubEnrichmentReference,
} from "../services/bidclubEpisodeCache";

export { resolveAudioUrl } from "../hooks/useAudioPlayer";

type DetailViewTab = DetailTab | "notes";

interface SelectionActionState {
  quote: string;
  rawQuote: string;
  source: DetailTab;
  startOffset: number;
  endOffset: number;
  left: number;
  top: number;
  transcriptStartMs?: number;
  writing: boolean;
  noteId?: string;
}

function getContentTextNodes(container: HTMLElement): Text[] {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest("button, textarea")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }
  return nodes;
}

function getRangeOffsets(container: HTMLElement, range: Range): { startOffset: number; endOffset: number } | null {
  let offset = 0;
  let startOffset: number | null = null;
  let endOffset: number | null = null;
  for (const node of getContentTextNodes(container)) {
    if (range.intersectsNode(node)) {
      if (startOffset === null) {
        startOffset = offset + (node === range.startContainer ? range.startOffset : 0);
      }
      endOffset = offset + (node === range.endContainer ? range.endOffset : node.data.length);
    }
    offset += node.data.length;
  }
  return startOffset === null || endOffset === null ? null : { startOffset, endOffset };
}

function findHighlight(container: HTMLElement, noteId: string): HTMLElement | undefined {
  for (const mark of container.querySelectorAll<HTMLElement>("mark[data-note-id]")) {
    if (mark.dataset.noteId === noteId) return mark;
  }
  return undefined;
}

function createRangeFromOffsets(container: HTMLElement, start: number, end: number): Range | null {
  const nodes = getContentTextNodes(container);
  let offset = 0;
  let startNode: Text | null = null;
  let endNode: Text | null = null;
  let startOffset = 0;
  let endOffset = 0;
  for (const node of nodes) {
    const nextOffset = offset + node.data.length;
    if (!startNode && start >= offset && start < nextOffset) {
      startNode = node;
      startOffset = start - offset;
    }
    if (endNode === null && end > offset && end <= nextOffset) {
      endNode = node;
      endOffset = end - offset;
      break;
    }
    offset = nextOffset;
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

function wrapRange(range: Range, mark: HTMLElement) {
  try {
    range.surroundContents(mark);
  } catch {
    const fragment = range.extractContents();
    mark.appendChild(fragment);
    range.insertNode(mark);
  }
}

function highlightExcerpt(container: HTMLElement, start: number, end: number, noteId: string) {
  if (findHighlight(container, noteId)) return;
  const range = createRangeFromOffsets(container, start, end);
  if (!range) return;
  const mark = document.createElement("mark");
  mark.className = "wreader-note-highlight rounded-sm bg-amber-200/80 px-0.5";
  mark.dataset.noteId = noteId;
  wrapRange(range, mark);
}

function removeSelectionPreview(container: HTMLElement | null) {
  const preview = container?.querySelector<HTMLElement>("mark[data-selection-preview]");
  if (!preview?.parentNode) return;
  const parent = preview.parentNode;
  while (preview.firstChild) parent.insertBefore(preview.firstChild, preview);
  parent.removeChild(preview);
  parent.normalize();
}

function showSelectionPreview(container: HTMLElement, start: number, end: number) {
  removeSelectionPreview(container);
  const range = createRangeFromOffsets(container, start, end);
  if (!range) return;
  const mark = document.createElement("mark");
  mark.dataset.selectionPreview = "true";
  mark.className = "wreader-selection-preview rounded-sm";
  wrapRange(range, mark);
}

function removeHighlight(container: HTMLElement | null, noteId: string) {
  const mark = container ? findHighlight(container, noteId) : undefined;
  if (!mark?.parentNode) return;
  const parent = mark.parentNode;
  while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
  parent.removeChild(mark);
  parent.normalize();
}

interface ArticleDetailModalProps {
  article: Article | null;
  onClose: () => void;
  onOpenNavigation?: () => void;
  onToggleStar: (articleId: string) => void;
  onToggleRead: (articleId: string) => void;
  onNextArticle?: () => void;
  onPrevArticle?: () => void;
  playlistIds?: string[];
  onTogglePlaylist?: (articleId: string) => void;
  savedProgress?: { currentTime: number; duration: number };
  audioPlayer?: SharedAudioPlayer;
  autoPlay?: boolean;
  onAutoPlayStarted?: () => void;
  onArticlePatch?: (articleId: string, patch: Partial<Article>) => void;
  /** Restores the detail scroller when returning to an article. */
  savedScrollTop?: number;
  /** Restores reading progress as a 0..1 position when no absolute offset is available. */
  savedReadingProgress?: number;
  onScrollPositionChange?: (articleId: string, scrollTop: number) => void;
  onReadingProgressChange?: (articleId: string, progress: number) => void;
  initialOpenTarget?: { tab: "notes" } | { tab: "transcript"; note: ArticleNote };
  initialDetailTab?: DetailViewTab;
  onDetailTabChange?: (tab: DetailViewTab) => void;
  isImmersive?: boolean;
  onToggleImmersive?: () => void;
}

export const ArticleDetailModal: React.FC<ArticleDetailModalProps> = ({
  article,
  onClose,
  onOpenNavigation,
  onToggleStar,
  onToggleRead,
  onNextArticle,
  onPrevArticle,
  playlistIds = [],
  onTogglePlaylist,
  savedProgress,
  audioPlayer,
  autoPlay = false,
  onAutoPlayStarted,
  onArticlePatch,
  savedScrollTop,
  savedReadingProgress,
  onScrollPositionChange,
  onReadingProgressChange,
  initialOpenTarget,
  initialDetailTab,
  onDetailTabChange,
  isImmersive = false,
  onToggleImmersive,
}) => {
  const [aiSummary, setAiSummary] = useState<string | null>(() => article?.aiSummary || null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [readingProgress, setReadingProgress] = useState(() => (
    Number.isFinite(savedReadingProgress) ? Math.min(1, Math.max(0, savedReadingProgress as number)) : 0
  ));
  const userInteractedRef = useRef(false);
  const [detailTab, setDetailTab] = useState<DetailViewTab>(() => (
    article ? resolveArticleDefaultTab(article) : "overview"
  ));
  const [notes, setNotes] = useState<ArticleNote[]>([]);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [selectionAction, setSelectionAction] = useState<SelectionActionState | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [readerSettingsOpen, setReaderSettingsOpen] = useState(false);
  const [readerFontSize, setReaderFontSize] = useState<"compact" | "standard" | "large">("standard");
  const [readerLineHeight, setReaderLineHeight] = useState<"compact" | "standard" | "relaxed">("standard");
  const [readerMeasure, setReaderMeasure] = useState<"compact" | "standard" | "wide">("standard");
  const [readerTheme, setReaderTheme] = useState<"light" | "paper" | "dark">("light");
  const [sessionHighlights, setSessionHighlights] = useState<Array<{
    noteId: string;
    source: DetailTab;
    startOffset: number;
    endOffset: number;
  }>>([]);
  const selectableContentRef = useRef<HTMLDivElement | null>(null);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const readerSettingsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const readerSettingsPopoverRef = useRef<HTMLDivElement | null>(null);
  const autoPlayStartedRef = useRef<string | null>(null);
  const appliedOpenTargetRef = useRef<string | null>(null);

  // BidClub episode state (TL;DR + digest + full transcript)
  const { episode: bidclub, loading: bidclubLoading, error: bidclubError, retry: retryBidclub } = useBidclubEpisode(
    article?.enrichment?.episodeId
  );
  const preferBidclubAlt = !!bidclub?.lang?.toLowerCase().startsWith("en");
  const bidclubTldrHtml = preferBidclubAlt
    ? bidclub?.tldrAltHtml || bidclub?.tldrHtml
    : bidclub?.tldrHtml || bidclub?.tldrAltHtml;
  const bidclubDigestHtml = preferBidclubAlt
    ? bidclub?.digestAltHtml || bidclub?.digestHtml
    : bidclub?.digestHtml || bidclub?.digestAltHtml;
  const bidclubDek = preferBidclubAlt
    ? bidclub?.dekAlt || bidclub?.dek
    : bidclub?.dek || bidclub?.dekAlt;

  const [detachedCurrentTime, setDetachedCurrentTime] = useState(savedProgress?.currentTime || 0);
  const isCurrentAudio = Boolean(article && audioPlayer?.articleId === article.id);
  const isPlaying = isCurrentAudio && Boolean(audioPlayer?.isPlaying);
  const currentTime = isCurrentAudio ? audioPlayer?.currentTime || 0 : detachedCurrentTime;
  const duration = isCurrentAudio ? audioPlayer?.duration || 0 : savedProgress?.duration || 0;
  const playbackRate = audioPlayer?.playbackRate || 1;
  const audioPlayError = isCurrentAudio ? audioPlayer?.audioPlayError || null : null;
  const seekTo = React.useCallback((seconds: number) => {
    setDetachedCurrentTime(seconds);
    if (!article?.audioUrl || !audioPlayer) return;
    if (audioPlayer.articleId === article.id) audioPlayer.seekTo(seconds);
    else audioPlayer.loadArticle(article.id, article.audioUrl, { currentTime: seconds, duration: savedProgress?.duration || 0 });
  }, [article, audioPlayer, savedProgress?.duration]);
  const localPodcast = useLocalPodcast(article, onArticlePatch);

  useEffect(() => {
    if (!article?.audioUrl || !autoPlay || autoPlayStartedRef.current === article.id) return;
    autoPlayStartedRef.current = article.id;
    const timer = window.setTimeout(() => {
      audioPlayer?.playArticle(article.id, article.audioUrl, savedProgress);
      onAutoPlayStarted?.();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [article?.id, article?.audioUrl, audioPlayer, autoPlay, onAutoPlayStarted, savedProgress]);

  const hasBidclubReference = article?.enrichment?.provider === "bidclub";
  const hasVerifiedBidclubEnrichment = isVerifiedBidclubEnrichment(article?.enrichment);
  const enrichmentStatus = !hasBidclubReference
    ? "none"
    : bidclubLoading
      ? "checking"
      : bidclub
        ? hasBidclubEnrichment(bidclub) ? "available" : "unavailable"
      : bidclubError
          ? "error"
          : "candidate";
  const presentation = useMemo(
    () => article
      ? normalizeDetailPresentation(resolveArticlePresentation(article, {
          status: enrichmentStatus,
          overview: bidclubTldrHtml,
          digest: bidclubDigestHtml,
          transcript: bidclub?.transcriptHtml,
        }))
      : null,
    [article, enrichmentStatus, bidclub, bidclubTldrHtml, bidclubDigestHtml]
  );

  const isInPlaylist = article ? playlistIds.includes(article.id) : false;

  // Sync detail state when article changes
  useEffect(() => {
    if (article) {
      setDetachedCurrentTime(savedProgress?.currentTime || 0);
      setAiSummary(article.aiSummary || null);
      setSummaryError(null);
      userInteractedRef.current = !!initialOpenTarget;
      setDetailTab(initialDetailTab || initialOpenTarget?.tab || resolveArticleDefaultTab(article));
      setNotes([]);
      setNotesLoaded(false);
      setNotesError(null);
      setReaderSettingsOpen(false);
      setSelectionAction(null);
      setSessionHighlights([]);
      appliedOpenTargetRef.current = null;
    }
  }, [article?.id, initialDetailTab, initialOpenTarget]);

  useEffect(() => {
    if (!article) return;
    let cancelled = false;
    getArticleNotesFromDB(article.id)
      .then((stored) => {
        if (!cancelled) {
          setNotes((current) => {
            const merged = new Map(stored.map((note) => [note.id, note]));
            current.forEach((note) => merged.set(note.id, note));
            return Array.from(merged.values()).sort((a, b) => a.createdAt - b.createdAt);
          });
          setNotesLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNotesError("笔记暂时无法读取");
          setNotesLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, [article?.id]);

  // Verified enrichment becomes the default once its real capabilities arrive,
  // unless the user has already chosen how to use this detail view.
  useEffect(() => {
    if (!presentation) return;
    setDetailTab((current) => {
      if (current === "notes" && (!notesLoaded || notes.length > 0)) return current;
      if (!userInteractedRef.current && presentation.processingState === "digested") {
        return presentation.defaultTab;
      }
      return resolveDetailTab(current as DetailTab, presentation, false);
    });
  }, [presentation, notes.length, notesLoaded]);

  useEffect(() => {
    if (!article || initialOpenTarget?.tab !== "transcript") return;
    const target = initialOpenTarget.note;
    const fingerprint = `${article.id}:${target.id}:${target.transcriptStartMs}`;
    if (appliedOpenTargetRef.current === fingerprint) return;
    if (target.transcriptStartMs === undefined) return;
    appliedOpenTargetRef.current = fingerprint;
    seekTo(target.transcriptStartMs / 1000);
    window.setTimeout(() => {
      const container = selectableContentRef.current;
      if (!container) return;
      const timed = container.querySelector(`[data-transcript-start-ms="${target.transcriptStartMs}"]`);
      timed?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }, 0);
  }, [article?.id, initialOpenTarget, localPodcast.artifacts, bidclub?.transcriptHtml, seekTo]);

  useEffect(() => {
    if (!article?.enrichment || bidclubLoading) return;
    const nextReference = resolveBidclubEnrichmentReference(
      article.enrichment,
      bidclubError ? null : bidclub,
    );
    const patch: Partial<Article> = {};
    if (
      article.enrichment.status !== nextReference.status ||
      article.enrichment.matchedBy !== nextReference.matchedBy
    ) {
      patch.enrichment = nextReference;
    }
    if (!article.thumbnail && bidclub?.thumbnailUrl) patch.thumbnail = bidclub.thumbnailUrl;
    if (Object.keys(patch).length > 0) onArticlePatch?.(article.id, patch);
  }, [article, bidclub, bidclubError, bidclubLoading, onArticlePatch]);

  useEffect(() => {
    const scrollElement = contentScrollRef.current;
    if (!scrollElement) return;

    const maxScrollTop = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
    const progress = Number.isFinite(savedReadingProgress)
      ? Math.min(1, Math.max(0, savedReadingProgress as number))
      : 0;
    setReadingProgress(progress);
    const target = savedScrollTop !== undefined
      ? Math.max(0, savedScrollTop)
      : savedReadingProgress !== undefined
        ? maxScrollTop * progress
        : 0;
    scrollElement.scrollTop = Math.min(target, maxScrollTop || target);
  }, [article?.id, savedScrollTop, savedReadingProgress, presentation?.tabs.length]);

  useEffect(() => {
    removeSelectionPreview(selectableContentRef.current);
    setSelectionAction(null);
  }, [detailTab, article?.id]);

  useLayoutEffect(() => {
    if (detailTab === "notes" || !selectableContentRef.current) return;
    for (const highlight of sessionHighlights) {
      if (highlight.source === detailTab) {
        highlightExcerpt(
          selectableContentRef.current,
          highlight.startOffset,
          highlight.endOffset,
          highlight.noteId,
        );
      }
    }
    if (selectionAction && !selectionAction.noteId && selectionAction.source === detailTab) {
      showSelectionPreview(
        selectableContentRef.current,
        selectionAction.startOffset,
        selectionAction.endOffset,
      );
    }
  });

  // Keyboard Navigation Support (Esc, Left/Right)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!article) return;
      const target = e.target;
      const isTyping = target instanceof Element && target.matches("input, textarea, [contenteditable='true']");
      if (e.key === "Escape") {
        if (readerSettingsOpen) {
          e.preventDefault();
          e.stopPropagation();
          setReaderSettingsOpen(false);
          readerSettingsTriggerRef.current?.focus();
          return;
        }
        if (selectionAction) {
          e.stopPropagation();
          removeSelectionPreview(selectableContentRef.current);
          setSelectionAction(null);
          return;
        }
        if (isImmersive) {
          e.stopPropagation();
          onToggleImmersive?.();
          return;
        }
        onClose();
      } else if (!isTyping && e.key === "ArrowLeft" && onPrevArticle) {
        onPrevArticle();
      } else if (!isTyping && e.key === "ArrowRight" && onNextArticle) {
        onNextArticle();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [article, onClose, onPrevArticle, onNextArticle, selectionAction, isImmersive, onToggleImmersive, readerSettingsOpen]);

  useEffect(() => {
    if (!readerSettingsOpen) return;
    const popover = readerSettingsPopoverRef.current;
    const focusable: HTMLElement[] = popover
      ? Array.from(popover.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"))
      : [];
    focusable[0]?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    popover?.addEventListener("keydown", trapFocus);
    return () => popover?.removeEventListener("keydown", trapFocus);
  }, [readerSettingsOpen]);

  if (!article) return null;

  // Only show the player when the article has a real audio enclosure
  const hasAudio = !!presentation?.capabilities.hasAudio;

  const handleSummarize = async () => {
    if (!presentation?.capabilities.canGenerateOverview || aiSummary || isSummarizing) return;
    setIsSummarizing(true);
    setSummaryError(null);
    try {
      const summary = await summarizeArticleWithAI(
        article.title,
        article.content,
        article.snippet
      );
      setAiSummary(summary);
      onArticlePatch?.(article.id, { aiSummary: summary });
    } catch (err: any) {
      setSummaryError(err.message || "AI 总结生成失败，请稍后重试。");
    } finally {
      setIsSummarizing(false);
    }
  };

  // Relative publish time string
  const getRelativeTimeStr = (pubDateStr: string) => {
    const date = new Date(pubDateStr);
    const now = new Date();
    const diffMs = Math.max(0, now.getTime() - date.getTime());
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return "刚刚";
    if (diffHours < 24) return `${diffHours} 小时前`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays} 天前`;
    return date.toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
  };

  const timeAgo = getRelativeTimeStr(article.pubDate);
  const showAuthor = article.author && article.author !== article.feedTitle;

  const tabs = presentation?.tabs || [];
  const markUserInteracted = () => {
    userInteractedRef.current = true;
  };
  const handleDetailTabChange = (tab: DetailTab) => {
    markUserInteracted();
    setDetailTab(tab);
    onDetailTabChange?.(tab);
  };
  const createNoteId = () => (
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `note-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const addSelectedNote = async (noteText?: string) => {
    if (!selectionAction) return;
    if (selectionAction.noteId) {
      const existing = notes.find((note) => note.id === selectionAction.noteId);
      if (existing) void updateNote(existing, noteText || "");
      removeSelectionPreview(selectableContentRef.current);
      setSelectionAction(null);
      setNoteDraft("");
      return;
    }
    const duplicate = sessionHighlights.find((highlight) =>
      highlight.source === selectionAction.source &&
      highlight.startOffset === selectionAction.startOffset &&
      highlight.endOffset === selectionAction.endOffset
    );
    if (duplicate) {
      const existing = notes.find((note) => note.id === duplicate.noteId);
      if (existing) {
        removeSelectionPreview(selectableContentRef.current);
        setNoteDraft(existing.note || "");
        setSelectionAction((current) => current ? { ...current, noteId: existing.id } : null);
      }
      return;
    }
    const now = Date.now();
    const highlight = {
      noteId: createNoteId(),
      source: selectionAction.source,
      startOffset: selectionAction.startOffset,
      endOffset: selectionAction.endOffset,
    };
    const next: ArticleNote = {
      id: highlight.noteId,
      articleId: article.id,
      source: selectionAction.source,
      quote: selectionAction.quote,
      note: noteText?.trim() || undefined,
      transcriptStartMs: selectionAction.source === "transcript"
        ? selectionAction.transcriptStartMs
        : undefined,
      createdAt: now,
      updatedAt: now,
    };
    removeSelectionPreview(selectableContentRef.current);
    setNotes((current) => [...current, next]);
    setNotesLoaded(true);
    setSessionHighlights((current) => [...current, highlight]);
    setNotesError(null);
    window.getSelection()?.removeAllRanges();
    setSelectionAction(null);
    setNoteDraft("");
    try {
      await saveArticleNoteToDB(next);
    } catch {
      setNotes((current) => current.filter((item) => item.id !== next.id));
      setSessionHighlights((current) => current.filter((item) => item.noteId !== next.id));
      removeHighlight(selectableContentRef.current, next.id);
      setNotesError("笔记保存失败，请重试");
    }
  };
  const updateNote = async (item: ArticleNote, text: string) => {
    const updated = { ...item, note: text.trim() || undefined, updatedAt: Date.now() };
    setNotes((current) => current.map((note) => note.id === item.id ? updated : note));
    try {
      await saveArticleNoteToDB(updated);
    } catch {
      setNotes((current) => current.map((note) => note.id === item.id ? item : note));
      setNotesError("笔记更新失败，请重试");
    }
  };
  const deleteNote = async (item: ArticleNote) => {
    if (item.note && !window.confirm("这条摘录包含笔记内容，确定删除吗？")) return;
    const previous = notes;
    const previousHighlights = sessionHighlights;
    const remaining = notes.filter((note) => note.id !== item.id);
    setNotes(remaining);
    setSessionHighlights((current) => current.filter((highlight) => highlight.noteId !== item.id));
    removeSelectionPreview(selectableContentRef.current);
    removeHighlight(selectableContentRef.current, item.id);
    setSelectionAction(null);
    if (remaining.length === 0 && detailTab === "notes") {
      setDetailTab(presentation?.defaultTab || "body");
      onDetailTabChange?.(presentation?.defaultTab || "body");
    }
    try {
      await deleteArticleNoteFromDB(item.id);
    } catch {
      setNotes(previous);
      setSessionHighlights(previousHighlights);
      setNotesError("笔记删除失败，请重试");
    }
  };
  const openTranscriptNote = (item: ArticleNote) => {
    if (item.source !== "transcript" || item.transcriptStartMs === undefined) return;
    markUserInteracted();
    setDetailTab("transcript");
    onDetailTabChange?.("transcript");
    if (item.transcriptStartMs !== undefined) seekTo(item.transcriptStartMs / 1000);
    window.setTimeout(() => {
      const container = selectableContentRef.current;
      if (!container) return;
      const timed = item.transcriptStartMs === undefined
        ? null
        : container.querySelector(`[data-transcript-start-ms="${item.transcriptStartMs}"]`);
      let quoteTarget: Element | null = timed;
      if (!quoteTarget) {
        for (const element of container.querySelectorAll<HTMLElement>("p, li, section, div")) {
          if (element.textContent?.includes(item.quote)) {
            quoteTarget = element;
            break;
          }
        }
      }
      quoteTarget?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }, 0);
  };
  const captureSelection = (event?: React.SyntheticEvent) => {
    const clickedHighlight = event?.target instanceof Element && !!event.target.closest("mark[data-note-id]");
    window.setTimeout(() => {
      if (detailTab === "notes") return;
      const container = selectableContentRef.current;
      const selection = window.getSelection();
      if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
        if (!clickedHighlight) {
          removeSelectionPreview(container);
          setSelectionAction(null);
        }
        return;
      }
      const range = selection.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) return;
      const rangeStartElement = range.startContainer.nodeType === Node.ELEMENT_NODE
        ? range.startContainer as Element
        : range.startContainer.parentElement;
      const rangeEndElement = range.endContainer.nodeType === Node.ELEMENT_NODE
        ? range.endContainer as Element
        : range.endContainer.parentElement;
      const selectedMark = rangeStartElement?.closest<HTMLElement>("mark[data-note-id]")
        || rangeEndElement?.closest<HTMLElement>("mark[data-note-id]");
      if (selectedMark?.dataset.noteId) {
          removeSelectionPreview(container);
          const item = notes.find((note) => note.id === selectedMark.dataset.noteId);
          const highlight = sessionHighlights.find((entry) => entry.noteId === selectedMark.dataset.noteId);
          if (item && highlight) {
            const rect = range.getBoundingClientRect();
            setNoteDraft(item.note || "");
            setSelectionAction({
              quote: item.quote,
              rawQuote: selection.toString().trim() || item.quote,
              source: item.source,
              startOffset: highlight.startOffset,
              endOffset: highlight.endOffset,
              transcriptStartMs: item.transcriptStartMs,
              left: Math.min(window.innerWidth - 16, Math.max(16, rect.left + rect.width / 2)),
              top: Math.max(12, rect.top - 8),
              writing: false,
              noteId: item.id,
            });
            return;
          }
      }
      const rawQuote = selection.toString().trim();
      const quote = rawQuote.replace(/\s+/g, " ");
      if (!quote) return;
      markUserInteracted();
      const ancestor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer as Element
        : range.commonAncestorContainer.parentElement;
      const segment = ancestor?.closest<HTMLElement>("[data-transcript-start-ms]");
      const segmentStartMs = segment ? Number(segment.dataset.transcriptStartMs) : undefined;
      const rect = range.getBoundingClientRect();
      const offsets = getRangeOffsets(container, range);
      if (!offsets) return;
      showSelectionPreview(container, offsets.startOffset, offsets.endOffset);
      setNoteDraft("");
      setSelectionAction({
        quote,
        rawQuote,
        source: detailTab,
        ...offsets,
        transcriptStartMs: detailTab === "transcript" && Number.isFinite(segmentStartMs)
          ? segmentStartMs
          : undefined,
        left: Math.min(window.innerWidth - 16, Math.max(16, rect.left + rect.width / 2)),
        top: Math.max(12, rect.top - 8),
        writing: false,
      });
    }, 0);
  };
  const handleHighlightClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const mark = (event.target as Element).closest<HTMLElement>("mark[data-note-id]");
    const noteId = mark?.dataset.noteId;
    if (!mark || !noteId) return;
    const item = notes.find((note) => note.id === noteId);
    const highlight = sessionHighlights.find((entry) => entry.noteId === noteId);
    if (!item || !highlight) return;
    removeSelectionPreview(selectableContentRef.current);
    const rect = mark.getBoundingClientRect();
    setNoteDraft(item.note || "");
    setSelectionAction({
      quote: item.quote,
      rawQuote: mark.textContent || item.quote,
      source: item.source,
      startOffset: highlight.startOffset,
      endOffset: highlight.endOffset,
      transcriptStartMs: item.transcriptStartMs,
      left: Math.min(window.innerWidth - 16, Math.max(16, rect.left + rect.width / 2)),
      top: Math.max(12, rect.top - 8),
      writing: false,
      noteId,
    });
  };
  const handleTogglePlay = () => {
    markUserInteracted();
    if (article.audioUrl) audioPlayer?.toggleArticle(article.id, article.audioUrl, savedProgress);
  };
  const handleContentScroll = (event: React.UIEvent<HTMLDivElement>) => {
    markUserInteracted();
    const scrollElement = event.currentTarget;
    const maxScrollTop = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
    const rawProgress = maxScrollTop === 0 ? 0 : scrollElement.scrollTop / maxScrollTop;
    const progress = Number.isFinite(rawProgress) ? Math.min(1, Math.max(0, rawProgress)) : 0;
    setReadingProgress(progress);
    onScrollPositionChange?.(article.id, scrollElement.scrollTop);
    onReadingProgressChange?.(article.id, progress);
  };

  return (
    <section
      id="article-reader"
      aria-label="文章阅读"
      data-notes-loaded={notesLoaded}
      data-immersive={isImmersive}
      data-reader-font-size={readerFontSize}
      data-reader-line-height={readerLineHeight}
      data-reader-measure={readerMeasure}
      data-reader-theme={readerTheme}
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white text-slate-900"
    >
      <div className="shrink-0 border-b border-slate-200/80 bg-white" aria-label="阅读工具栏">
        <div className="wreader-reader-toolbar-inner mx-auto grid min-h-14 w-full max-w-[760px] grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2 sm:px-5" style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr" }}>
          <div className="wreader-reader-nav flex shrink-0 items-center gap-1">
          <button
            type="button"
            ref={readerSettingsTriggerRef}
            onClick={onClose}
            className="inline-flex h-9 w-9 min-h-9 min-w-9 shrink-0 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer sm:h-10 sm:w-10 sm:min-h-10 sm:min-w-10"
            title="返回文章列表"
            aria-label="返回文章列表"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          {onOpenNavigation && <button
            type="button"
            onClick={onOpenNavigation}
            className="wreader-reader-menu inline-flex h-9 w-9 min-h-9 min-w-9 shrink-0 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-10 sm:w-10 sm:min-h-10 sm:min-w-10"
            title="打开导航菜单"
            aria-label="打开导航菜单"
          ><Menu className="h-4 w-4" /></button>}
          <div className="hidden h-5 w-px bg-slate-200 sm:block" aria-hidden="true" />
            {onPrevArticle && (
              <button type="button" onClick={onPrevArticle} aria-label="上一篇" title="上一篇 (←)" className="inline-flex h-9 w-9 min-h-9 min-w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 cursor-pointer sm:h-10 sm:w-10 sm:min-h-10 sm:min-w-10">
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            {onNextArticle && (
              <button type="button" onClick={onNextArticle} aria-label="下一篇" title="下一篇 (→)" className="inline-flex h-9 w-9 min-h-9 min-w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 cursor-pointer sm:h-10 sm:w-10 sm:min-h-10 sm:min-w-10">
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </div>
          <div className="wreader-reader-actions reader-actions flex shrink-0 items-center gap-1" data-detail-tools aria-label="文章快捷操作">
            <button
              type="button"
              onClick={() => onToggleRead(article.id)}
              className={`reader-action inline-flex h-9 w-9 min-h-9 min-w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 cursor-pointer sm:h-10 sm:w-10 sm:min-h-10 sm:min-w-10 ${!article.read ? "bg-blue-50 text-blue-600" : ""}`}
              title={article.read ? "标记为未读" : "标记为已读"}
              aria-label={article.read ? "标记为未读" : "标记为已读"}
            >
              {article.read ? <MailOpen className="h-4 w-4 text-slate-400" /> : <Mail className="h-4 w-4 text-blue-600" />}
            </button>
            <button
              type="button"
              onClick={() => onToggleStar(article.id)}
              className={`reader-action inline-flex h-9 w-9 min-h-9 min-w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 cursor-pointer sm:h-10 sm:w-10 sm:min-h-10 sm:min-w-10 ${article.starred ? "bg-blue-50 text-blue-600" : ""}`}
              title={article.starred ? "取消收藏" : "收藏文章"}
              aria-label={article.starred ? "取消收藏" : "收藏文章"}
            >
              <Star className={`h-4 w-4 ${article.starred ? "fill-blue-600" : ""}`} />
            </button>
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="reader-action inline-flex h-9 w-9 min-h-9 min-w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 sm:h-10 sm:w-10 sm:min-h-10 sm:min-w-10"
              title="打开原文"
              aria-label="打开原文"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          <button
            type="button"
            className="reader-action reader-settings-button"
            onClick={() => setReaderSettingsOpen((open) => !open)}
            title="阅读设置"
            aria-label="阅读设置"
            aria-expanded={readerSettingsOpen}
          >Aa</button>
          {onToggleImmersive && (
            <button
              type="button"
              onClick={onToggleImmersive}
              className="reader-action inline-flex h-9 w-9 min-h-9 min-w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 cursor-pointer sm:h-10 sm:w-10 sm:min-h-10 sm:min-w-10"
              title={isImmersive ? "退出沉浸模式" : "进入沉浸模式"}
              aria-label={isImmersive ? "退出沉浸模式" : "进入沉浸模式"}
              aria-pressed={isImmersive}
            >
              {isImmersive ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}
          </div>
        </div>
        <div className="h-0.5 w-full bg-slate-100" aria-hidden="true">
          <div
            className="h-full bg-blue-500 transition-[width] duration-150"
            style={{ width: `${Number.isFinite(readingProgress) ? readingProgress * 100 : 0}%` }}
            data-reading-progress
          />
        </div>
      </div>

      {readerSettingsOpen && (
        <div ref={readerSettingsPopoverRef} className="reader-settings-popover" role="dialog" aria-label="阅读设置">
          <strong>阅读设置</strong>
          <label>字号 <span><button type="button" className={readerFontSize === "compact" ? "is-selected" : ""} onClick={() => setReaderFontSize("compact")} aria-label="减小字号">A</button><button type="button" className={readerFontSize === "standard" ? "is-selected" : ""} onClick={() => setReaderFontSize("standard")} aria-label="标准字号">A</button><button type="button" className={readerFontSize === "large" ? "is-selected" : ""} onClick={() => setReaderFontSize("large")} aria-label="增大字号">A</button></span></label>
          <label>行距 <span><button type="button" className={readerLineHeight === "compact" ? "is-selected" : ""} onClick={() => setReaderLineHeight("compact")}>1.5</button><button type="button" className={readerLineHeight === "standard" ? "is-selected" : ""} onClick={() => setReaderLineHeight("standard")}>1.8</button><button type="button" className={readerLineHeight === "relaxed" ? "is-selected" : ""} onClick={() => setReaderLineHeight("relaxed")}>2.0</button></span></label>
          <label>版心 <span><button type="button" className={readerMeasure === "compact" ? "is-selected" : ""} onClick={() => setReaderMeasure("compact")}>紧凑</button><button type="button" className={readerMeasure === "standard" ? "is-selected" : ""} onClick={() => setReaderMeasure("standard")}>标准</button><button type="button" className={readerMeasure === "wide" ? "is-selected" : ""} onClick={() => setReaderMeasure("wide")}>宽松</button></span></label>
          <label>主题 <span className="theme-swatches"><button type="button" className={`theme-light ${readerTheme === "light" ? "is-selected" : ""}`} onClick={() => setReaderTheme("light")} aria-label="浅色" /><button type="button" className={`theme-paper ${readerTheme === "paper" ? "is-selected" : ""}`} onClick={() => setReaderTheme("paper")} aria-label="米黄" /><button type="button" className={`theme-dark ${readerTheme === "dark" ? "is-selected" : ""}`} onClick={() => setReaderTheme("dark")} aria-label="深色" /></span></label>
        </div>
      )}

      {/* Scrollable Content */}
        <div
          ref={contentScrollRef}
          className="reader-scroll flex-1 overflow-y-auto px-6 pb-6 pt-6 scrollbar-thin sm:px-10 sm:pt-8"
          onScroll={handleContentScroll}
        >
          <div className="reader-column w-full max-w-[650px] mx-auto">
            {/* Title & Subtitle */}
            <h1 className="text-xl font-bold leading-snug tracking-tight text-slate-900 sm:text-[28px] sm:leading-[1.3]">
              {article.title}
            </h1>
            <div className="reader-subtitle min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <strong>{article.feedTitle}</strong>
                {showAuthor && (
                  <>
                    <span>·</span>
                    <span>{article.author}</span>
                  </>
                )}
                <span>·</span>
                <span>{timeAgo}</span>
            </div>

            {presentation?.contentType === "article" && (
              <section className="ai-summary-card mt-5" aria-label="AI 摘要">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold text-violet-900">
                    <Sparkle className="h-4 w-4 shrink-0 text-violet-500" aria-hidden="true" />
                    <span>AI 摘要</span>
                  </div>
                  {!aiSummary && (
                    <button type="button" onClick={handleSummarize} disabled={isSummarizing} className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-violet-800 transition-colors hover:bg-violet-100 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                      {isSummarizing ? "生成中…" : summaryError ? "重试" : "生成摘要"}
                    </button>
                  )}
                </div>
                {aiSummary && <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-violet-950/80">{aiSummary}</p>}
                {!aiSummary && summaryError && <p className="mt-2 text-xs text-rose-700" role="alert">{summaryError}</p>}
              </section>
            )}

            {/* Audio Card (仅真实播客音频) */}
            {hasAudio && <AudioPlayerCard model={{ article, isPlaying, currentTime, duration, playbackRate, audioPlayError, isInPlaylist, onTogglePlaylist, togglePlay: handleTogglePlay, onSeek: seekTo, onRateChange: () => audioPlayer?.cyclePlaybackRate(), onRewind: () => seekTo(currentTime - 15), onForward: () => seekTo(currentTime + 30) }} />}

            {/* Cover Image (无音频时占播放器位置；BidClub 用节目真实封面) */}
            {!hasAudio && (article.thumbnail || bidclub?.thumbnailUrl) && (
              <div className="mt-6 rounded-xl overflow-hidden bg-slate-100">
                <img
                  src={resolveImageUrl(article.thumbnail || bidclub?.thumbnailUrl)}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="w-full max-h-[320px] object-cover"
                  onError={(e) => {
                    const coverSrc = article.thumbnail || bidclub?.thumbnailUrl;
                    const target = e.currentTarget;
                    if (coverSrc && coverSrc.includes("@") && !target.dataset.triedClean) {
                      target.dataset.triedClean = "true";
                      target.src = coverSrc.replace(/@[^/]+$/, "");
                    } else if (!target.dataset.triedProxy && coverSrc) {
                      target.dataset.triedProxy = "true";
                      target.src = `/api/proxy-image?url=${encodeURIComponent(coverSrc)}`;
                    } else {
                      target.closest("div")!.style.display = "none";
                    }
                  }}
                />
              </div>
            )}

            {/* Ordinary articles are a continuous reading flow. Tabs are only
                needed for podcasts/enrichment or when an article has notes. */}
            {(tabs.length > 1 || (notesLoaded && notes.length > 0)) && <div role="tablist" aria-label="文章内容" data-notes-loaded={notesLoaded} className="reader-tabs">
              {tabs.map((tab) => {
                const isInsightTab = tab.key === "overview" || tab.key === "digest";
                const hasInsightContent = tab.key === "overview"
                  ? !!(bidclubTldrHtml?.trim() || bidclubDigestHtml?.trim())
                  : !!bidclubDigestHtml?.trim();
                const InsightIcon = tab.key === "body"
                  ? FileText
                  : tab.key === "transcript"
                    ? AudioLines
                    : Sparkle;
                return (
                  <button
                    type="button"
                    key={tab.key}
                    onClick={() => handleDetailTabChange(tab.key)}
                    role="tab"
                    aria-selected={detailTab === tab.key}
                    className={`reader-tab ${
                      detailTab === tab.key
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <InsightIcon
                      className={`reader-tab-icon ${
                        isInsightTab && enrichmentStatus === "available" && hasVerifiedBidclubEnrichment && hasInsightContent
                          ? "text-violet-500"
                          : "text-slate-400"
                      }`}
                      aria-hidden="true"
                    />
                    {tab.label}
                  </button>
                );
              })}
              {notesLoaded && notes.length > 0 && (
                <button
                  type="button"
                  onClick={() => { markUserInteracted(); setDetailTab("notes"); onDetailTabChange?.("notes"); }}
                  role="tab"
                  aria-selected={detailTab === "notes"}
                  className={`reader-tab ${
                    detailTab === "notes"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <MessageSquareText className="reader-tab-icon" aria-hidden="true" />
                  笔记 <em>{notes.length}</em>
                </button>
              )}
            </div>}

            {presentation?.enrichmentStatus === "checking" && (
              <p className="mt-3 text-xs text-slate-400" role="status">正在检查整理内容…</p>
            )}
            {presentation?.enrichmentStatus === "error" && (
              <div className="mt-3 flex items-center gap-2 text-xs text-amber-700" role="status">
                <span>整理内容暂时无法加载，正文仍可正常阅读。</span>
                <button type="button" onClick={retryBidclub} className="font-semibold underline underline-offset-2">
                  重试
                </button>
              </div>
            )}

            {/* Tab Content */}
            <div
              ref={selectableContentRef}
              className="pt-5"
              onPointerUp={detailTab === "notes" ? undefined : captureSelection}
              onKeyUp={detailTab === "notes" ? undefined : captureSelection}
              onClick={detailTab === "notes" ? undefined : handleHighlightClick}
            >
              {detailTab === "notes" ? (
                <ArticleNotesTab notes={notes} onUpdate={updateNote} onDelete={deleteNote} onOpenTranscript={openTranscriptNote} />
              ) : (
                <ArticleInsightTabs model={{ article, tab: detailTab, summary: aiSummary, canGenerateSummary: !!presentation?.capabilities.canGenerateOverview, enrichmentLoading: bidclubLoading, enrichmentError: bidclubError, overviewHtml: bidclubTldrHtml, digestHtml: bidclubDigestHtml, dek: bidclubDek, transcriptHtml: bidclub?.transcriptHtml, sourceUrl: bidclub?.sourceUrl, sourceLabel: bidclub?.sourceLabel, onSummarize: handleSummarize, summarizing: isSummarizing, summaryError, localArtifacts: localPodcast.artifacts, localProgress: localPodcast.progress, localFetchError: localPodcast.fetchError, localRestoring: localPodcast.restoring, onStartTranscription: localPodcast.startTranscription, onRetryTranscription: localPodcast.retryTranscription, onCreateInsight: localPodcast.createInsight, onSeekTranscript: seekTo }} />
              )}
            </div>
            {notesError && <p className="mt-3 text-xs text-rose-600" role="alert">{notesError}</p>}

            {/* Universal source footer */}
            <div className="mt-8 border-t border-slate-100 pt-4 text-xs text-slate-400">
              <span>原文来源：</span>
              <a href={article.link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
                {article.feedTitle || article.link}
              </a>
            </div>
          </div>
        </div>
        {selectionAction && (
          <div
            className="fixed z-[70] -translate-x-1/2 -translate-y-full rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
            style={{ left: selectionAction.left, top: selectionAction.top }}
            role="toolbar"
            aria-label="文本标注"
            onPointerDown={(event) => event.preventDefault()}
          >
            {selectionAction.writing ? (
              <div className="w-72 p-1" onPointerDown={(event) => event.stopPropagation()}>
                <textarea
                  aria-label="新笔记内容"
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  rows={3}
                  autoFocus
                  placeholder="写下你的想法…"
                  className="w-full resize-y rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <div className="mt-1.5 flex justify-end gap-2">
                  <button type="button" onClick={() => { removeSelectionPreview(selectableContentRef.current); setSelectionAction(null); }} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100">取消</button>
                  <button type="button" onClick={() => void addSelectedNote(noteDraft)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">保存</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                {selectionAction.noteId ? (
                  <>
                    <button type="button" onClick={() => setSelectionAction((current) => current ? { ...current, writing: true } : null)} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">编辑笔记</button>
                    <button type="button" onClick={() => { const item = notes.find((note) => note.id === selectionAction.noteId); if (item) void deleteNote(item); }} className="rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50">删除</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => void addSelectedNote()} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-amber-50 hover:text-amber-800">高亮</button>
                    <button type="button" onClick={() => setSelectionAction((current) => current ? { ...current, writing: true } : null)} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">写笔记</button>
                  </>
                )}
                <button type="button" onClick={() => { void navigator.clipboard.writeText(selectionAction.quote); removeSelectionPreview(selectableContentRef.current); setSelectionAction(null); window.getSelection()?.removeAllRanges(); }} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">复制</button>
              </div>
            )}
          </div>
        )}
    </section>
  );
};
