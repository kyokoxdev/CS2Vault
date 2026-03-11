/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, render, screen } from "@testing-library/react";
import React, { useEffect, useRef } from "react";
import "../setup-component";

let observerCallback: IntersectionObserverCallback;
let mockDisconnect: ReturnType<typeof vi.fn>;

beforeEach(() => {
    mockDisconnect = vi.fn();

    const mockObserver = {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: mockDisconnect,
        root: null,
        rootMargin: "0px",
        thresholds: [0],
        takeRecords: vi.fn(() => []),
    };

    global.IntersectionObserver = vi.fn(function(this: unknown, callback: IntersectionObserverCallback) {
        observerCallback = callback;
        return mockObserver;
    }) as unknown as typeof IntersectionObserver;
});

afterEach(() => {
    vi.restoreAllMocks();
});

async function importHook() {
    const mod = await import("../../src/hooks/useScrollReveal");
    return mod.useScrollReveal;
}

type HookResult = { isVisible: boolean };

async function renderHookInDOM(): Promise<{ getResult: () => HookResult; unmount: () => void }> {
    const useScrollReveal = await importHook();
    let capturedResult: HookResult = { isVisible: false };

    function TestComponent({ onResult }: { onResult: (r: HookResult) => void }) {
        const { ref, isVisible } = useScrollReveal();
        onResult({ isVisible });
        return React.createElement("div", { ref: ref as React.RefObject<HTMLDivElement>, "data-testid": "target" });
    }

    const { unmount } = render(
        React.createElement(TestComponent, { onResult: (r: HookResult) => { capturedResult = r; } })
    );

    return {
        getResult: () => capturedResult,
        unmount,
    };
}

describe("useScrollReveal", () => {
    it("starts with isVisible as false", async () => {
        const useScrollReveal = await importHook();
        const { result } = renderHook(() => useScrollReveal());
        expect(result.current.isVisible).toBe(false);
    });

    it("becomes visible on intersection", async () => {
        const { getResult } = await renderHookInDOM();

        act(() => {
            observerCallback(
                [{ isIntersecting: true, target: document.createElement("div") } as unknown as IntersectionObserverEntry],
                {} as IntersectionObserver
            );
        });

        expect(getResult().isVisible).toBe(true);
    });

    it("stays visible with freezeOnceVisible (default)", async () => {
        const { getResult } = await renderHookInDOM();

        act(() => {
            observerCallback(
                [{ isIntersecting: true, target: document.createElement("div") } as unknown as IntersectionObserverEntry],
                {} as IntersectionObserver
            );
        });
        expect(getResult().isVisible).toBe(true);

        act(() => {
            observerCallback(
                [{ isIntersecting: false, target: document.createElement("div") } as unknown as IntersectionObserverEntry],
                {} as IntersectionObserver
            );
        });
        expect(getResult().isVisible).toBe(true);
    });

    it("disconnects observer on unmount", async () => {
        const { unmount } = await renderHookInDOM();
        unmount();
        expect(mockDisconnect).toHaveBeenCalled();
    });
});
