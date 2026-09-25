import { useCallback, useEffect, useRef, useState } from "react";
import type { Feed } from "../types";

export interface RefreshFeedbackState {
  failed: Feed[];
  successful: number;
  newArticles: number;
  finishedAt?: number;
}

export function useReaderToast() {
  const [toast, setToast] = useState<{ message: string; action?: { label: string; run: () => void } } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToast({ message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const showToastWithAction = useCallback((message: string, action: { label: string; run: () => void }) => {
    setToast({ message, action });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  return { toast, showToast, showToastWithAction };
}

export function useRefreshFeedback(refreshState: RefreshFeedbackState, isRefreshing: boolean) {
  const [refreshFeedback, setRefreshFeedback] = useState<"success" | "failure" | null>(null);
  const [isRefreshFailureDetailsOpen, setIsRefreshFailureDetailsOpen] = useState(false);
  const refreshFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (refreshFeedbackTimer.current) clearTimeout(refreshFeedbackTimer.current);
  }, []);

  useEffect(() => {
    if (!refreshState.finishedAt || isRefreshing) return;
    if (refreshFeedbackTimer.current) clearTimeout(refreshFeedbackTimer.current);
    if (refreshState.failed.length > 0) {
      setRefreshFeedback("failure");
      setIsRefreshFailureDetailsOpen(false);
      return;
    }
    setRefreshFeedback("success");
    refreshFeedbackTimer.current = setTimeout(() => setRefreshFeedback(null), 3500);
  }, [isRefreshing, refreshState.failed.length, refreshState.finishedAt]);

  return {
    refreshFeedback,
    setRefreshFeedback,
    isRefreshFailureDetailsOpen,
    setIsRefreshFailureDetailsOpen,
  };
}
