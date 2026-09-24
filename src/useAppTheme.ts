import { useEffect, useLayoutEffect, useState } from "react";
import { applyTheme, parseTheme, readTheme, THEME_STORAGE_KEY } from "./theme";

export function useAppTheme() {
  const [theme, setTheme] = useState(readTheme);

  useLayoutEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Theme changes still work when preference storage is unavailable.
    }
  }, [theme]);

  useEffect(() => {
    const syncTheme = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== localStorage) return;
      if (event.key === THEME_STORAGE_KEY || event.key === null) {
        setTheme(parseTheme(event.newValue));
      }
    };
    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);

  return {
    theme,
    toggleTheme: () => setTheme(current => current === "light" ? "dark" : "light"),
  };
}
