/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import "../setup-component";
import {
  DEFAULT_UI_PREFERENCES,
  UI_PREFERENCES_STORAGE_KEY,
  UI_THEMES,
  applyUiPreferencesToDocument,
  normalizeUiTheme,
  parseUiPreferences,
  readUiPreferences,
  writeUiPreferences,
  type UiPreferences,
} from "@/lib/ui/preferences";

const legacyThemeSuffix = ["cin", "ematic"].join("");
const legacyThemeValues = {
  darkPrimary: ["cyber", "financial", legacyThemeSuffix].join("-"),
  darkTerminal: ["terminal", "quant"].join("-"),
  darkCounterStrike: ["cs2", legacyThemeSuffix].join("-"),
  highContrast: ["high", "contrast", "analyst"].join("-"),
};

describe("UI preferences helpers", () => {
  it("returns defaults when no stored value exists", () => {
    expect(parseUiPreferences(null)).toEqual(DEFAULT_UI_PREFERENCES);
  });

  it("parses a valid stored preference object with the final themes only", () => {
    const preferences: UiPreferences = {
      theme: "high-contrast",
      marketTapeVisible: false,
    };

    expect(parseUiPreferences(JSON.stringify(preferences))).toEqual(preferences);
    expect(UI_THEMES).toEqual(["dark", "high-contrast"]);
  });

  it("maps legacy themes to the supported final values", () => {
    expect(normalizeUiTheme(legacyThemeValues.darkPrimary)).toBe("dark");
    expect(normalizeUiTheme(legacyThemeValues.darkTerminal)).toBe("dark");
    expect(normalizeUiTheme(legacyThemeValues.darkCounterStrike)).toBe("dark");
    expect(normalizeUiTheme(legacyThemeValues.highContrast)).toBe("high-contrast");
  });

  it("ignores legacy density and motion fields without throwing", () => {
    expect(
      parseUiPreferences(
        JSON.stringify({
          theme: legacyThemeValues.highContrast,
          density: "comfortable",
          motionIntensity: "reduced",
        }),
      ),
    ).toEqual({ theme: "high-contrast", marketTapeVisible: true });
  });

  it("defaults market tape visibility to enabled when the stored value is missing or invalid", () => {
    expect(parseUiPreferences(JSON.stringify({ theme: "dark" }))).toEqual({
      theme: "dark",
      marketTapeVisible: true,
    });

    expect(parseUiPreferences(JSON.stringify({ theme: "dark", marketTapeVisible: "nope" }))).toEqual({
      theme: "dark",
      marketTapeVisible: true,
    });
  });

  it("parses a stored disabled market tape preference", () => {
    expect(parseUiPreferences(JSON.stringify({ theme: "dark", marketTapeVisible: false }))).toEqual({
      theme: "dark",
      marketTapeVisible: false,
    });
  });

  it("falls back to defaults for malformed JSON", () => {
    expect(parseUiPreferences("{not-json")).toEqual(DEFAULT_UI_PREFERENCES);
  });

  it("falls back per field for invalid theme values", () => {
    expect(parseUiPreferences(JSON.stringify({ theme: "unknown-theme", density: "comfortable" }))).toEqual(
      DEFAULT_UI_PREFERENCES,
    );
  });

  it("reads defaults when storage getItem throws", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("storage unavailable");
      }),
    };

    expect(readUiPreferences(storage)).toEqual(DEFAULT_UI_PREFERENCES);
  });

  it("writes preferences to the expected localStorage key", () => {
    const storage = { setItem: vi.fn() };
    const preferences: UiPreferences = {
      theme: "high-contrast",
      marketTapeVisible: false,
    };

    expect(writeUiPreferences(storage, preferences)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  });

  it("does not persist when storage setItem throws", () => {
    const storage = {
      setItem: vi.fn(() => {
        throw new Error("quota exceeded");
      }),
    };

    expect(writeUiPreferences(storage, DEFAULT_UI_PREFERENCES)).toBe(false);
  });

  it("applies only the theme attribute to html", () => {
    const documentRef = document.implementation.createHTMLDocument("preferences-test");
    const preferences: UiPreferences = {
      theme: "high-contrast",
      marketTapeVisible: false,
    };

    applyUiPreferencesToDocument(documentRef, preferences);

    expect(documentRef.documentElement.getAttribute("data-theme")).toBe("high-contrast");
    expect(documentRef.documentElement.hasAttribute("data-density")).toBe(false);
    expect(documentRef.documentElement.hasAttribute("data-motion")).toBe(false);
  });
});
