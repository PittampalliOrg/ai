"use client";

import { useState, useEffect, useCallback } from "react";
import type { DiffPreferences, DiffViewMode, DiffContentMode } from "@/lib/diff/types";

const DIFF_PREFERENCES_KEY = "diff-preferences";

const DEFAULT_PREFERENCES: DiffPreferences = {
  viewMode: "unified",
  contentMode: "incremental",
};

function savePreferencesToLocalStorage(prefs: DiffPreferences): void {
  try {
    localStorage.setItem(DIFF_PREFERENCES_KEY, JSON.stringify(prefs));
  } catch (error) {
    console.warn("Failed to save diff preferences to localStorage:", error);
  }
}

function getPreferencesFromLocalStorage(): DiffPreferences {
  try {
    const stored = localStorage.getItem(DIFF_PREFERENCES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (
        parsed &&
        (parsed.viewMode === "unified" || parsed.viewMode === "split") &&
        (parsed.contentMode === "incremental" || parsed.contentMode === "full")
      ) {
        return parsed as DiffPreferences;
      }
    }
    return DEFAULT_PREFERENCES;
  } catch (error) {
    console.warn("Failed to retrieve diff preferences from localStorage:", error);
    return DEFAULT_PREFERENCES;
  }
}

export interface UseDiffPreferencesReturn {
  viewMode: DiffViewMode;
  contentMode: DiffContentMode;
  setViewMode: (mode: DiffViewMode) => void;
  setContentMode: (mode: DiffContentMode) => void;
}

export function useDiffPreferences(): UseDiffPreferencesReturn {
  const [preferences, setPreferences] = useState<DiffPreferences>(DEFAULT_PREFERENCES);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage on mount (client-side only)
  useEffect(() => {
    const storedPrefs = getPreferencesFromLocalStorage();
    setPreferences(storedPrefs);
    setIsHydrated(true);
  }, []);

  const setViewMode = useCallback((mode: DiffViewMode) => {
    setPreferences((prev) => {
      const newPrefs = { ...prev, viewMode: mode };
      savePreferencesToLocalStorage(newPrefs);
      return newPrefs;
    });
  }, []);

  const setContentMode = useCallback((mode: DiffContentMode) => {
    setPreferences((prev) => {
      const newPrefs = { ...prev, contentMode: mode };
      savePreferencesToLocalStorage(newPrefs);
      return newPrefs;
    });
  }, []);

  return {
    viewMode: preferences.viewMode,
    contentMode: preferences.contentMode,
    setViewMode,
    setContentMode,
  };
}
