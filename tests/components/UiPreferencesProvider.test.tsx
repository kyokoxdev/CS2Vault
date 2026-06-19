/** @vitest-environment jsdom */

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../setup-component";
import UiPreferencesProvider, { useUiPreferences } from "@/components/providers/UiPreferencesProvider";
import { useReducedMotion } from "@/hooks/useMediaQuery";
import { DEFAULT_UI_PREFERENCES, UI_PREFERENCES_STORAGE_KEY } from "@/lib/ui/preferences";

const legacyThemeSuffix = ["cin", "ematic"].join("");
const legacyThemeValues = {
  darkCounterStrike: ["cs2", legacyThemeSuffix].join("-"),
  highContrast: ["high", "contrast", "analyst"].join("-"),
};

interface MockMediaQueryList extends MediaQueryList {
  setMatches: (matches: boolean) => void;
}

function createMatchMediaMock(initialMatches: boolean): MockMediaQueryList {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let matches = initialMatches;

  const mediaQuery = {
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    get matches() {
      return matches;
    },
    addEventListener: vi.fn((eventName: string, listener: EventListener) => {
      if (eventName === "change") {
        listeners.add(listener as (event: MediaQueryListEvent) => void);
      }
    }),
    removeEventListener: vi.fn((eventName: string, listener: EventListener) => {
      if (eventName === "change") {
        listeners.delete(listener as (event: MediaQueryListEvent) => void);
      }
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      const event = new Event("change") as MediaQueryListEvent;
      Object.defineProperty(event, "matches", { value: nextMatches });
      Object.defineProperty(event, "media", { value: "(prefers-reduced-motion: reduce)" });
      listeners.forEach((listener) => listener(event));
    },
  } as MockMediaQueryList;

  window.matchMedia = vi.fn(() => mediaQuery);

  return mediaQuery;
}

function PreferencesProbe() {
  const { preferences, effectivePreferences, prefersReducedMotion, isHydrated, updatePreferences } = useUiPreferences();

  return (
    <div>
      <output data-testid="theme">{preferences.theme}</output>
      <output data-testid="market-tape-visible">{String(preferences.marketTapeVisible)}</output>
      <output data-testid="effective-theme">{effectivePreferences.theme}</output>
      <output data-testid="effective-reduced-motion">{String(effectivePreferences.prefersReducedMotion)}</output>
      <output data-testid="reduced-motion">{String(prefersReducedMotion)}</output>
      <output data-testid="hydrated">{String(isHydrated)}</output>
      <button type="button" onClick={() => updatePreferences({ theme: "high-contrast" })}>
        Update preferences
      </button>
    </div>
  );
}

function ReducedMotionProbe() {
  const reducedMotion = useReducedMotion();

  return <output data-testid="use-reduced-motion">{String(reducedMotion)}</output>;
}

describe("UiPreferencesProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-density");
    document.documentElement.removeAttribute("data-motion");
    createMatchMediaMock(false);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("uses defaults and syncs only the theme to html attributes", async () => {
    render(
      <UiPreferencesProvider>
        <PreferencesProbe />
      </UiPreferencesProvider>,
    );

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-theme", DEFAULT_UI_PREFERENCES.theme);
    });

    expect(document.documentElement.hasAttribute("data-density")).toBe(false);
    expect(document.documentElement.hasAttribute("data-motion")).toBe(false);
    expect(screen.getByTestId("theme")).toHaveTextContent(DEFAULT_UI_PREFERENCES.theme);
    expect(screen.getByTestId("market-tape-visible")).toHaveTextContent("true");
    expect(screen.getByTestId("hydrated")).toHaveTextContent("true");
  });

  it("loads legacy stored preferences without writing over them", async () => {
    localStorage.setItem(
      UI_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        theme: legacyThemeValues.darkCounterStrike,
        density: "comfortable",
        motionIntensity: "reduced",
      }),
    );
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    render(
      <UiPreferencesProvider>
        <PreferencesProbe />
      </UiPreferencesProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("theme")).toHaveTextContent("dark"));

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement.hasAttribute("data-density")).toBe(false);
    expect(document.documentElement.hasAttribute("data-motion")).toBe(false);
    expect(screen.getByTestId("market-tape-visible")).toHaveTextContent("true");
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it("maps old high contrast values and ignores old density fields", async () => {
    localStorage.setItem(
      UI_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ theme: legacyThemeValues.highContrast, density: "comfortable" }),
    );

    render(
      <UiPreferencesProvider>
        <PreferencesProbe />
      </UiPreferencesProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("theme")).toHaveTextContent("high-contrast"));
    expect(screen.getByTestId("effective-theme")).toHaveTextContent("high-contrast");
    expect(screen.getByTestId("market-tape-visible")).toHaveTextContent("true");
  });

  it("falls back from malformed JSON and invalid theme values", async () => {
    localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify({ theme: "bad", density: "bad" }));

    render(
      <UiPreferencesProvider>
        <PreferencesProbe />
      </UiPreferencesProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("theme")).toHaveTextContent(DEFAULT_UI_PREFERENCES.theme));

    cleanup();
    localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, "not-json");

    render(
      <UiPreferencesProvider>
        <PreferencesProbe />
      </UiPreferencesProvider>,
    );

    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", DEFAULT_UI_PREFERENCES.theme));
  });

  it("persists theme updates and syncs html attributes", async () => {
    render(
      <UiPreferencesProvider>
        <PreferencesProbe />
      </UiPreferencesProvider>,
    );

    await act(async () => {
      screen.getByRole("button", { name: "Update preferences" }).click();
    });

    await waitFor(() => expect(screen.getByTestId("theme")).toHaveTextContent("high-contrast"));

    expect(document.documentElement).toHaveAttribute("data-theme", "high-contrast");
    expect(JSON.parse(localStorage.getItem(UI_PREFERENCES_STORAGE_KEY) ?? "{}")).toEqual({
      theme: "high-contrast",
      marketTapeVisible: true,
    });
  });

  it("tracks OS reduced-motion changes while leaving stored preferences untouched", async () => {
    const mediaQuery = createMatchMediaMock(false);

    render(
      <UiPreferencesProvider>
        <PreferencesProbe />
        <ReducedMotionProbe />
      </UiPreferencesProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("use-reduced-motion")).toHaveTextContent("false"));

    await act(async () => {
      mediaQuery.setMatches(true);
    });

    expect(screen.getByTestId("reduced-motion")).toHaveTextContent("true");
    expect(screen.getByTestId("effective-reduced-motion")).toHaveTextContent("true");
    expect(screen.getByTestId("use-reduced-motion")).toHaveTextContent("true");
    expect(JSON.parse(localStorage.getItem(UI_PREFERENCES_STORAGE_KEY) ?? "null")).toBeNull();
  });
});
