import { useEffect, useSyncExternalStore } from "react";
import { appearanceSnapshot, subscribeAppearance, updateAppearance, type AppearancePreferences } from "../services/appearancePreferences";

export function useAppearancePreferences() {
  const snapshot = useSyncExternalStore(subscribeAppearance, appearanceSnapshot, appearanceSnapshot);
  const preferences = JSON.parse(snapshot) as AppearancePreferences;
  useEffect(() => {
    if (preferences.font !== "serif" || document.getElementById("reader-serif-font")) return;
    const link = document.createElement("link");
    link.id = "reader-serif-font";
    link.rel = "stylesheet";
    link.href = "/fonts/source-han-serif/font.css";
    document.head.appendChild(link);
  }, [preferences.font]);
  return { preferences, updateAppearance };
}
