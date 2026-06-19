"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_UI_PREFERENCES,
  applyUiPreferencesToDocument,
  getEffectiveUiPreferences,
  readUiPreferences,
  writeUiPreferences,
  type EffectiveUiPreferences,
  type UiPreferences,
} from "@/lib/ui/preferences";

interface UiPreferencesContextValue {
  preferences: UiPreferences;
  effectivePreferences: EffectiveUiPreferences;
  prefersReducedMotion: boolean;
  isHydrated: boolean;
  setPreferences: (preferences: UiPreferences) => void;
  updatePreferences: (updates: Partial<UiPreferences>) => void;
}

const DEFAULT_EFFECTIVE_PREFERENCES = getEffectiveUiPreferences(DEFAULT_UI_PREFERENCES, false);

const UiPreferencesContext = createContext<UiPreferencesContextValue | null>(null);

function getLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getReducedMotionMediaQuery(): MediaQueryList | null {
  try {
    if (typeof window.matchMedia !== "function") {
      return null;
    }

    return window.matchMedia("(prefers-reduced-motion: reduce)");
  } catch {
    return null;
  }
}

function subscribeToReducedMotion(
  mediaQuery: MediaQueryList,
  onChange: (matches: boolean) => void,
): () => void {
  const handleChange = (event: MediaQueryListEvent) => {
    onChange(event.matches);
  };

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }

  mediaQuery.addListener(handleChange);
  return () => mediaQuery.removeListener(handleChange);
}

export default function UiPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferenceState] = useState<UiPreferences>(DEFAULT_UI_PREFERENCES);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const storedPreferences = readUiPreferences(getLocalStorage());
    const mediaQuery = getReducedMotionMediaQuery();

    setPreferenceState(storedPreferences);
    setPrefersReducedMotion(mediaQuery?.matches ?? false);
    applyUiPreferencesToDocument(document, storedPreferences);
    setIsHydrated(true);

    if (!mediaQuery) {
      return;
    }

    return subscribeToReducedMotion(mediaQuery, setPrefersReducedMotion);
  }, []);

  useEffect(() => {
    applyUiPreferencesToDocument(document, preferences);
  }, [preferences]);

  const setPreferences = useCallback((nextPreferences: UiPreferences) => {
    setPreferenceState(nextPreferences);
    writeUiPreferences(getLocalStorage(), nextPreferences);
  }, []);

  const updatePreferences = useCallback((updates: Partial<UiPreferences>) => {
    setPreferenceState((currentPreferences) => {
      const nextPreferences = { ...currentPreferences, ...updates };
      writeUiPreferences(getLocalStorage(), nextPreferences);
      return nextPreferences;
    });
  }, []);

  const effectivePreferences = useMemo(
    () => getEffectiveUiPreferences(preferences, prefersReducedMotion),
    [preferences, prefersReducedMotion],
  );

  return (
    <UiPreferencesContext.Provider
      value={{
        preferences,
        effectivePreferences,
        prefersReducedMotion,
        isHydrated,
        setPreferences,
        updatePreferences,
      }}
    >
      {children}
    </UiPreferencesContext.Provider>
  );
}

export function useUiPreferences(): UiPreferencesContextValue {
  const ctx = useContext(UiPreferencesContext);

  if (!ctx) {
    return {
      preferences: DEFAULT_UI_PREFERENCES,
      effectivePreferences: DEFAULT_EFFECTIVE_PREFERENCES,
      prefersReducedMotion: false,
      isHydrated: false,
      setPreferences: () => {},
      updatePreferences: () => {},
    };
  }

  return ctx;
}
