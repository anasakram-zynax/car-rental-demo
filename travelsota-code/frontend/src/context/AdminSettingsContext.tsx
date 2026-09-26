"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  defaultSettings,
  radii,
  type LayoutType,
  type ModeType,
  type ThemeName,
} from "@/config/admin-theme-presets";

export interface AdminSettings {
  theme: ThemeName;
  mode: ModeType;
  radius: number;
  layout: LayoutType;
}

export interface AdminSettingsValue {
  settings: AdminSettings;
  updateSettings: (patch: Partial<AdminSettings>) => void;
  resetSettings: () => void;
  shellClass: string;
  themeClass: string;
  radiusClass: string;
}

const AdminSettingsContext = createContext<AdminSettingsValue | null>(null);
const STORAGE_KEY = "travelsota-admin-settings-v2";

interface PersistedSettings {
  theme: ThemeName;
  mode: ModeType;
  radius: number;
  layout: LayoutType;
}

const DEFAULT_PERSISTED: PersistedSettings = {
  theme: defaultSettings.theme,
  mode: defaultSettings.mode,
  radius: defaultSettings.radius,
  layout: defaultSettings.layout,
};

function loadPersisted(): PersistedSettings {
  if (typeof window === "undefined") return DEFAULT_PERSISTED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PERSISTED;
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
    return {
      theme: DEFAULT_PERSISTED.theme,
      // Admin v1 is intentionally light-only. Ignore any stale mode saved by an older build.
      mode: "light",
      radius: parsed.radius !== undefined && (radii as readonly number[]).includes(parsed.radius) ? parsed.radius : DEFAULT_PERSISTED.radius,
      layout: parsed.layout === "vertical" || parsed.layout === "horizontal" ? parsed.layout : DEFAULT_PERSISTED.layout,
    };
  } catch {
    return DEFAULT_PERSISTED;
  }
}

export function AdminSettingsProvider({ children }: { children: React.ReactNode }) {
  const [initial] = useState<PersistedSettings>(() => loadPersisted());
  const [theme, setTheme] = useState<ThemeName>(initial.theme);
  // Keep the field for persisted-settings compatibility; the admin UI is light-only.
  const [mode] = useState<ModeType>("light");
  const [radius, setRadius] = useState<number>(initial.radius);
  const [layout, setLayout] = useState<LayoutType>(initial.layout);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, mode, radius, layout }));
  }, [theme, mode, radius, layout]);

  const updateSettings = useCallback((patch: Partial<AdminSettings>) => {
    if (patch.theme !== undefined) setTheme(DEFAULT_PERSISTED.theme);
    // Theme switching is intentionally disabled for the v1 admin demo.
    if (patch.radius !== undefined) setRadius(patch.radius);
    if (patch.layout !== undefined) setLayout(patch.layout);
  }, []);

  const resetSettings = useCallback(() => {
    setTheme(DEFAULT_PERSISTED.theme);
    // Admin mode is always light in v1.
    setRadius(DEFAULT_PERSISTED.radius);
    setLayout(DEFAULT_PERSISTED.layout);
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const settings = useMemo(() => ({ theme, mode, radius, layout }), [theme, mode, radius, layout]);
  const themeClass = `theme-${theme}`;
  const radiusClass = `radius-${radius}`;
  // Admin v1 is always light; the public theme preference remains independent.
  const shellClass = `${themeClass} ${radiusClass}`;

  const value = useMemo<AdminSettingsValue>(() => ({
    settings,
    updateSettings,
    resetSettings,
    shellClass,
    themeClass,
    radiusClass,
  }), [settings, updateSettings, resetSettings, shellClass, themeClass, radiusClass]);

  return <AdminSettingsContext.Provider value={value}>{children}</AdminSettingsContext.Provider>;
}

export function useAdminSettings() {
  const context = useContext(AdminSettingsContext);
  if (!context) throw new Error("useAdminSettings must be used within AdminSettingsProvider");
  return context;
}
