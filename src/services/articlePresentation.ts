import type {
  Article,
  ArticlePresentation,
  DetailTabPresentation,
  EnrichmentStatus,
} from "../types";
import { isVerifiedBidclubEnrichment } from "./bidclubEpisodeCache";

export interface ArticleEnrichmentAvailability {
  status?: EnrichmentStatus;
  overview?: string | null;
  digest?: string | null;
  transcript?: string | null;
}

function hasText(value?: string | null): boolean {
  return !!value?.trim();
}

/**
 * Derives display behavior from the canonical reference plus the current detail
 * payload. Persistent availability and transient loading/error state stay separate.
 */
export function resolveArticlePresentation(
  article: Article,
  enrichment: ArticleEnrichmentAvailability = {}
): ArticlePresentation {
  const hasAudio = hasText(article.audioUrl);
  const hasProviderReference = article.enrichment?.provider === "bidclub";
  const hasProviderOverview = hasProviderReference && hasText(enrichment.overview);
  const hasProviderDigest = hasProviderReference && hasText(enrichment.digest);
  const hasProviderTranscript = hasProviderReference && hasText(enrichment.transcript);
  const hasProviderContent = hasProviderOverview || hasProviderDigest || hasProviderTranscript;
  const storedStatus = !hasProviderReference
    ? "none"
    : isVerifiedBidclubEnrichment(article.enrichment)
      ? "available"
      : "candidate";
  const requestedStatus = enrichment.status || storedStatus;
  const enrichmentStatus: EnrichmentStatus = !hasProviderReference
    ? "none"
    : enrichment.status && enrichment.status !== "available"
      ? enrichment.status
      : hasProviderContent
        ? "available"
        : isVerifiedBidclubEnrichment(article.enrichment)
          ? "available"
          : requestedStatus === "available"
            ? "candidate"
            : requestedStatus;
  const isDigested = enrichmentStatus === "available" && (
    isVerifiedBidclubEnrichment(article.enrichment) || hasProviderContent
  );

  const hasOverview = isDigested
    ? hasProviderOverview
    : !hasAudio || (!hasProviderReference && hasText(enrichment.overview));
  const hasDigest = hasProviderDigest;
  const hasTranscript = hasProviderTranscript;

  // Phase one only summarizes article bodies. Show notes are not a transcript.
  const canGenerateOverview = !hasAudio && !isDigested;

  const capabilities = {
    hasAudio,
    hasCover: hasText(article.thumbnail),
    // Body/show notes are the universal fallback, even if only the snippet is available.
    hasBody: true,
    hasOverview,
    hasDigest,
    hasTranscript,
    canGenerateOverview,
  };

  const bodyTab: DetailTabPresentation = {
    key: "body",
    label: hasAudio ? "节目介绍" : "正文",
  };
  const overviewTab: DetailTabPresentation = { key: "overview", label: "AI 摘要" };
  // Articles keep the same tab structure as podcasts: the body is always first,
  // and the overview tab appears whenever it has content or can still be generated.
  const tabs: DetailTabPresentation[] = hasAudio
    ? [bodyTab, overviewTab, { key: "transcript", label: "逐字稿" }]
    : canGenerateOverview || hasOverview
      ? [bodyTab, overviewTab]
      : [bodyTab];

  return {
    contentType: hasAudio ? "podcast" : "article",
    processingState: isDigested ? "digested" : "raw",
    enrichmentStatus,
    enrichmentProvider: article.enrichment?.provider,
    capabilities,
    tabs,
    defaultTab: tabs[0]?.key || "body",
  };
}
