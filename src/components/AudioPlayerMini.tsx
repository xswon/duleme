import { Headphones, Pause, Play, RotateCcw, X } from "lucide-react";
import type { Article } from "../types";
import { formatAudioTime, type SharedAudioPlayer } from "../hooks/useAudioPlayer";
import { retryBackendImage } from "../services/mediaAssetService";
import { resolveImageUrl } from "./ArticleList";
import { resolveDurationLabel } from "./AudioPlayerCard";

interface AudioPlayerMiniProps {
  article: Article;
  player: SharedAudioPlayer;
  onOpen: () => void;
}

/** A controller for the global media element; opening it never reloads the track. */
export function AudioPlayerMini({ article, player, onOpen }: AudioPlayerMiniProps) {
  const cover = article.thumbnail || article.feedFavicon;
  const ended = player.duration > 0 && player.currentTime >= player.duration && !player.isPlaying;
  const progress = player.duration > 0 ? Math.max(0, Math.min(100, player.currentTime / player.duration * 100)) : 0;
  const toggleLabel = player.isPlaying ? "暂停" : ended ? "重新播放" : "播放";
  return <section className="wreader-mini-player" aria-label="伴听播放器" data-playing={player.isPlaying}>
    <button type="button" className="wreader-mini-open" onClick={onOpen} aria-label={`返回播客：${article.title}`}>
      <span className="wreader-mini-cover" aria-hidden="true">
        <Headphones />
        {cover && <img key={cover} src={resolveImageUrl(cover)} alt="" referrerPolicy="no-referrer" onError={(event) => {
          if (!retryBackendImage(event.currentTarget, cover)) event.currentTarget.style.display = "none";
        }} />}
        {player.isPlaying && <span className="wreader-mini-wave"><i /><i /><i /></span>}
      </span>
      <span className="wreader-mini-copy">
        <strong title={article.title}>{article.title}</strong>
        <span className="wreader-mini-progress" aria-hidden="true"><i style={{ width: `${progress}%` }} /></span>
        <span className="wreader-mini-time" title={player.audioPlayError || undefined}>
          {player.audioPlayError ? "音频载入失败，点此查看" : ended ? "已播放完毕" : `${formatAudioTime(player.currentTime)} / ${resolveDurationLabel(player.duration, article.duration)}`}
        </span>
      </span>
    </button>
    <div className="wreader-mini-controls">
      <button type="button" className="player-icon-btn" aria-label="后退 15 秒" title="后退 15 秒" onClick={() => player.seekTo(player.currentTime - 15)}><RotateCcw aria-hidden="true" /></button>
      <button type="button" className="player-toggle" aria-label={toggleLabel} title={toggleLabel} onClick={() => {
        if (article.audioUrl) player.toggleArticle(article.id, article.audioUrl);
      }}>{player.isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</button>
      <button type="button" className="player-icon-btn" aria-label="停止并关闭播放器" title="停止并关闭播放器" onClick={player.stop}><X aria-hidden="true" /></button>
    </div>
  </section>;
}
