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
  transcriptionAvailable: false,
};

function hasText(value?: string | null): boolean {
  return !!value?.trim();
}

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
  const hasCloudTranscript = article.transcription?.status === "completed" && Boolean(article.transcription.segments?.length);
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
  const hasTranscript = hasProviderTranscript || hasCloudTranscript || hasLocalTranscript;
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
  const tabs: DetailTabPresentation[] = [bodyTab];

  // Keep the AI summary entry discoverable for ordinary articles even when
  // no model is configured. The overview panel itself renders a muted setup
  // state until generation becomes available.
  if (!hasAudio || hasOverview || canGenerateOverview) {
    tabs.push({ key: "overview", label: "AI 摘要" });
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
