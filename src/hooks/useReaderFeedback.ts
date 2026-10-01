import { useCallback, useEffect, useRef, useState } from "react";
import type { Feed } from "../types";

export interface RefreshFeedbackState {
  failed: Feed[];
  total: number;
  successful: number;
  newArticles: number;
  finishedAt?: number;
  mode?: "refresh" | "retry" | "background";
  criticalFailure?: boolean;
}

export function useReaderToast() {
  type ReaderToast = { message: string; action?: { label: string; run: () => void } };
  const [toastQueue, setToastQueue] = useState<ReaderToast[]>([]);
  const toast = toastQueue[0] || null;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToastQueue((current) => [...current, { message }]);
  }, []);

  const showToastWithAction = useCallback((message: string, action: { label: string; run: () => void }) => {
    setToastQueue((current) => [...current, { message, action }]);
  }, []);

  useEffect(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (!toast) return;
    toastTimer.current = setTimeout(() => {
      setToastQueue((current) => current.slice(1));
    }, toast.action ? 5000 : 3000);
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [toast]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  return { toast, showToast, showToastWithAction };
}

export function useRefreshFeedback(refreshState: RefreshFeedbackState, isRefreshing: boolean) {
  const [refreshFeedback, setRefreshFeedback] = useState<"success" | "partial" | "failure" | "retrying" | null>(null);
  const [isRefreshFailureDetailsOpen, setIsRefreshFailureDetailsOpen] = useState(false);
  const refreshFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (refreshFeedbackTimer.current) clearTimeout(refreshFeedbackTimer.current);
  }, []);

  useEffect(() => {
    if (refreshFeedbackTimer.current) clearTimeout(refreshFeedbackTimer.current);
    if (isRefreshing) {
      setIsRefreshFailureDetailsOpen(false);
      setRefreshFeedback(refreshState.mode === "retry" ? "retrying" : null);
      return;
    }
    if (!refreshState.finishedAt) return;
    if (refreshState.mode === "background" && !refreshState.criticalFailure) {
      setRefreshFeedback(null);
      return;
    }
    if (refreshState.failed.length > 0) {
      const systemicFailure = refreshState.mode === "refresh"
        && refreshState.total > 1
        && refreshState.failed.length === refreshState.total;
      setRefreshFeedback(refreshState.criticalFailure || systemicFailure ? "failure" : "partial");
      setIsRefreshFailureDetailsOpen(false);
      if (!refreshState.criticalFailure && !systemicFailure) {
        refreshFeedbackTimer.current = setTimeout(() => setRefreshFeedback(null), 5_000);
      }
      return;
    }
    setRefreshFeedback("success");
    refreshFeedbackTimer.current = setTimeout(() => setRefreshFeedback(null), 3500);
  }, [isRefreshing, refreshState.criticalFailure, refreshState.failed.length, refreshState.finishedAt, refreshState.mode, refreshState.total]);

  useEffect(() => {
    if (isRefreshFailureDetailsOpen && refreshFeedbackTimer.current) clearTimeout(refreshFeedbackTimer.current);
  }, [isRefreshFailureDetailsOpen]);

  return {
    refreshFeedback,
    setRefreshFeedback,
    isRefreshFailureDetailsOpen,
    setIsRefreshFailureDetailsOpen,
  };
}
