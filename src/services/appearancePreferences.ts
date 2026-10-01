export type ThemePreference = "system" | "light" | "dark";
export interface AppearancePreferences {
  theme: ThemePreference;
  font: "sans" | "serif";
  alignment: "left" | "justify";
}
export const APPEARANCE_KEY = "wreader.appearance.v1";
const CHANGE_EVENT = "wreader:appearance";
const defaults: AppearancePreferences = { theme: "system", font: "sans", alignment: "left" };
let memory = defaults;
let sessionOnly = false;

export function parseAppearance(value: string | null): AppearancePreferences {
  try {
    const parsed = JSON.parse(value || "{}");
    return {
      theme: ["system", "light", "dark"].includes(parsed?.theme) ? parsed.theme : "system",
      font: parsed?.font === "serif" ? "serif" : "sans",
      alignment: parsed?.alignment === "justify" ? "justify" : "left",
    };
  } catch { return { ...defaults }; }
}

export function readAppearance(): AppearancePreferences {
  if (sessionOnly) return memory;
  try { return parseAppearance(localStorage.getItem(APPEARANCE_KEY)); }
  catch { return memory; }
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): "light" | "dark" {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

export function applyTheme() {
  const theme = resolveTheme(readAppearance().theme, window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function updateAppearance(patch: Partial<AppearancePreferences>) {
  memory = { ...readAppearance(), ...patch };
  try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify(memory)); sessionOnly = false; } catch { sessionOnly = true; /* Session preference survives unavailable storage. */ }
  applyTheme();
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeAppearance(onChange: () => void) {
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  const changed = () => { applyTheme(); onChange(); };
  const systemChanged = () => { if (readAppearance().theme === "system") applyTheme(); };
  const storageChanged = (event: StorageEvent) => {
    if (event.key === APPEARANCE_KEY || event.key === null) { sessionOnly = false; changed(); }
  };
  window.addEventListener(CHANGE_EVENT, changed);
  window.addEventListener("storage", storageChanged);
  media?.addEventListener("change", systemChanged);
  applyTheme();
  return () => {
    window.removeEventListener(CHANGE_EVENT, changed);
    window.removeEventListener("storage", storageChanged);
    media?.removeEventListener("change", systemChanged);
  };
}

export const appearanceSnapshot = () => JSON.stringify(readAppearance());
