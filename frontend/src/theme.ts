const THEME_KEY = "emw_theme";

export type ThemeMode = "light" | "dark";

export function getTheme(): ThemeMode {
  const saved = (localStorage.getItem(THEME_KEY) || "").toLowerCase();
  if (saved === "light" || saved === "dark") return saved as ThemeMode;

  // default to system preference if nothing saved
  return window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement; // <html>
  root.classList.toggle("emw-dark", mode === "dark");
}

export function setTheme(mode: ThemeMode) {
  localStorage.setItem(THEME_KEY, mode);
  applyTheme(mode);
}

export function toggleTheme(): ThemeMode {
  const next: ThemeMode = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
