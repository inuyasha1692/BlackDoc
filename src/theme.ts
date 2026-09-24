import { createContext } from "react";

export type AppTheme = "light" | "dark";
export const THEME_STORAGE_KEY = "blackdoc:theme";
export const AppThemeContext = createContext<AppTheme>("light");

export const parseTheme = (value: string | null): AppTheme =>
  value === "dark" ? "dark" : "light";

export function readTheme(): AppTheme {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "light";
  }
}

export function applyTheme(theme: AppTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}
