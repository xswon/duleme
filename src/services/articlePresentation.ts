import type {
  Article,
  ArticlePresentation,
  DetailTabPresentation,
  EnrichmentStatus,
  RuntimeCapabilities,
} from "../types";
import { isVerifiedBidclubEnrichment } from "./bidclubEpisodeCache";

export interface ArticleEnrichmentAvailability {
  status?: EnrichmentStatus;
  overview?: string | null;
  digest?: string | null;
  transcript?: string | null;
}

const DEFAULT_RUNTIME_CAPABILITIES: RuntimeCapabilities = {
  aiConfigured: false,
  // NextEcho is a built-in local workflow and remains independent from article AI configuration.
  transcriptionAvailable: true,
};

function hasText(value?: string | null): boolean {
  return !!value?.trim();
}

/**
 * Derives display behavior from stored content, enrichment, and runtime capabilities.
 * Existing content always remains readable even when the service that created it is unavailable.
 */
export function resolveArticlePresentation(
  article: Article,
  enrichment: ArticleEnrichmentAvailability = {},
  runtime: RuntimeCapabilities = DEFAULT_RUNTIME_CAPABILITIES,
): ArticlePresentation {
  const hasAudio = hasText(article.audioUrl);
  const hasProviderReference = article.enrichment?.provider === "bidclub";
  const hasProviderOverview = hasProviderReference && hasText(enrichment.overview);
  const hasProviderDigest = hasProviderReference && hasText(enrichment.digest);
  const hasProviderTranscript = hasProviderReference && hasText(enrichment.transcript);
  const hasProviderContent = hasProviderOverview || hasProviderDigest || hasProviderTranscript;
  const hasLocalTranscript = article.localPodcast?.transcriptionStatus === "completed";
  const hasLocalInsight = article.localPodcast?.insightStatus === "completed";
  const hasStoredArticleSummary = !hasAudio && hasText(article.aiSummary);

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

  const hasOverview = hasStoredArticleSummary || hasProviderOverview || (hasAudio && hasProviderDigest) || hasLocalInsight;
  const hasDigest = hasProviderDigest;
  const hasTranscript = hasProviderTranscript || hasLocalTranscript;

  // Article-body summarization uses the configured generic AI endpoint.
  // Podcast transcript/insight generation remains a separate workflow.
  const canGenerateOverview = !hasAudio && !isDigested && runtime.aiConfigured;

  const capabilities = {
    hasAudio,
    hasCover: hasText(article.thumbnail),
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
  const tabs: DetailTabPresentation[] = [bodyTab];

  if (hasOverview || canGenerateOverview) {
    tabs.push(overviewTab);
  }
  if (hasAudio && (hasTranscript || runtime.transcriptionAvailable)) {
    tabs.push({ key: "transcript", label: "逐字稿" });
  }

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
