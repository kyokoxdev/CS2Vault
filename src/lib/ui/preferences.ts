export const UI_PREFERENCES_STORAGE_KEY = "cs2vault-ui-preferences";

export const UI_THEMES = ["dark", "high-contrast"] as const;

export type UiTheme = (typeof UI_THEMES)[number];

export interface UiPreferences {
  theme: UiTheme;
  marketTapeVisible: boolean;
}

export interface EffectiveUiPreferences extends UiPreferences {
  prefersReducedMotion: boolean;
}

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  theme: "dark",
  marketTapeVisible: true,
};

const LEGACY_THEME_PARTS = {
  dark: [
    { parts: ["cyber", "financial"], usesSuffix: true },
    { parts: ["terminal", "quant"], usesSuffix: false },
    { parts: ["cs2"], usesSuffix: true },
  ],
  highContrast: ["high", "contrast", "analyst"],
} as const;
const LEGACY_THEME_SUFFIX = ["cin", "ematic"].join("");
const LEGACY_DARK_THEMES = new Set(
  LEGACY_THEME_PARTS.dark.map(({ parts, usesSuffix }) => (
    usesSuffix ? [...parts, LEGACY_THEME_SUFFIX].join("-") : parts.join("-")
  )),
);
const LEGACY_HIGH_CONTRAST_THEME = LEGACY_THEME_PARTS.highContrast.join("-");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isUiTheme(value: unknown): value is UiTheme {
  return typeof value === "string" && UI_THEMES.includes(value as UiTheme);
}

export function normalizeUiTheme(value: unknown): UiTheme | null {
  if (isUiTheme(value)) {
    return value;
  }

  if (value === LEGACY_HIGH_CONTRAST_THEME) {
    return "high-contrast";
  }

  if (typeof value === "string" && LEGACY_DARK_THEMES.has(value)) {
    return "dark";
  }

  return null;
}

export function parseUiPreferences(rawValue: string | null): UiPreferences {
  if (!rawValue) {
    return DEFAULT_UI_PREFERENCES;
  }

  try {
    const parsed: unknown = JSON.parse(rawValue);

    if (!isRecord(parsed)) {
      return DEFAULT_UI_PREFERENCES;
    }

    return {
      theme: normalizeUiTheme(parsed.theme) ?? DEFAULT_UI_PREFERENCES.theme,
      marketTapeVisible:
        typeof parsed.marketTapeVisible === "boolean"
          ? parsed.marketTapeVisible
          : DEFAULT_UI_PREFERENCES.marketTapeVisible,
    };
  } catch {
    return DEFAULT_UI_PREFERENCES;
  }
}

export function readUiPreferences(storage: Pick<Storage, "getItem"> | null | undefined): UiPreferences {
  if (!storage) {
    return DEFAULT_UI_PREFERENCES;
  }

  try {
    return parseUiPreferences(storage.getItem(UI_PREFERENCES_STORAGE_KEY));
  } catch {
    return DEFAULT_UI_PREFERENCES;
  }
}

export function writeUiPreferences(
  storage: Pick<Storage, "setItem"> | null | undefined,
  preferences: UiPreferences,
): boolean {
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}

export function getEffectiveUiPreferences(
  preferences: UiPreferences,
  prefersReducedMotion: boolean,
): EffectiveUiPreferences {
  return {
    ...preferences,
    prefersReducedMotion,
  };
}

export function applyUiPreferencesToDocument(
  documentRef: Pick<Document, "documentElement">,
  preferences: UiPreferences,
): void {
  documentRef.documentElement.dataset.theme = preferences.theme;
}

export const UI_PREFERENCES_BOOTSTRAP_SCRIPT = `(() => {
  const defaultTheme = ${JSON.stringify(DEFAULT_UI_PREFERENCES.theme)};
  const themes = ${JSON.stringify(UI_THEMES)};
  const root = document.documentElement;
  let theme = defaultTheme;

  try {
    const rawValue = window.localStorage.getItem("${UI_PREFERENCES_STORAGE_KEY}");
    if (rawValue) {
      const parsed = JSON.parse(rawValue);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const storedTheme = parsed.theme;
        const highContrastTheme = ${JSON.stringify(LEGACY_HIGH_CONTRAST_THEME)};
        const darkThemes = ${JSON.stringify([...LEGACY_DARK_THEMES])};
        if (storedTheme === highContrastTheme) {
          theme = "high-contrast";
        } else if (typeof storedTheme === "string" && darkThemes.includes(storedTheme)) {
          theme = defaultTheme;
        } else if (typeof storedTheme === "string" && themes.includes(storedTheme)) {
          theme = storedTheme;
        }
      }
    }
  } catch {
    // Keep the default theme when localStorage or JSON access is unavailable.
  }

  root.dataset.theme = theme;
})();`;
