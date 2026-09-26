"use client";

import type React from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
type Theme = "light" | "dark";

// The public site is intentionally light-only for the demo release. Keep the
// mode API for compatibility with existing chart consumers, but never allow a
// persisted preference or OS setting to re-enable dark mode.
const LIGHT_MODE: ThemeMode = "light";
const LIGHT_THEME: Theme = "light";

type ThemeContextType = {
  /** Resolved light/dark mode used by existing chart and UI consumers. */
  theme: Theme;
  /** User preference exposed to the Reference-2 mode controls. */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const MODE_STORAGE_KEY = "theme-mode";
const LEGACY_STORAGE_KEY = "theme";

function getInitialMode(): ThemeMode {
  return LIGHT_MODE;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>(getInitialMode);
  const theme: Theme = LIGHT_THEME;

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Normalize old dark/system preferences so a later visit remains light.
    window.localStorage.setItem(MODE_STORAGE_KEY, LIGHT_MODE);
    window.localStorage.setItem(LEGACY_STORAGE_KEY, LIGHT_THEME);
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = LIGHT_THEME;
  }, []);

  const setMode = useCallback(() => {
    setModeState(LIGHT_MODE);
  }, []);

  // Kept as a no-op for compatibility with any stale consumer. The public
  // release no longer exposes a control that can switch the site to dark.
  const toggleTheme = useCallback(() => undefined, []);

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
