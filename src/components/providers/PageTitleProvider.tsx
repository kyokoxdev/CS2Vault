"use client";

import { createContext, useContext, useState, useEffect, useRef } from "react";

interface PageTitleState {
    title: string | null;
    backLabel: string | null;
    backHref: string | null;
}

interface PageTitleContextValue extends PageTitleState {
    setPageTitle: (title: string | null, options?: { backLabel?: string; backHref?: string }) => void;
}

const PageTitleContext = createContext<PageTitleContextValue | null>(null);

export default function PageTitleProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const [state, setState] = useState<PageTitleState>({
        title: null,
        backLabel: null,
        backHref: null,
    });

    const setPageTitle = (
        title: string | null,
        options?: { backLabel?: string; backHref?: string }
    ) => {
        setState({
            title,
            backLabel: options?.backLabel ?? null,
            backHref: options?.backHref ?? null,
        });
    };

    return (
        <PageTitleContext.Provider value={{ ...state, setPageTitle }}>
            {children}
        </PageTitleContext.Provider>
    );
}

export function usePageTitleContext(): PageTitleContextValue {
    const ctx = useContext(PageTitleContext);
    if (!ctx) {
        throw new Error("usePageTitleContext must be used within PageTitleProvider");
    }
    return ctx;
}

export function usePageTitle(
    title: string | null,
    options?: { backLabel?: string; backHref?: string }
) {
    const ctx = useContext(PageTitleContext);
    const backLabel = options?.backLabel ?? null;
    const backHref = options?.backHref ?? null;

    const prevRef = useRef<{ title: string | null; backLabel: string | null; backHref: string | null }>({
        title: null,
        backLabel: null,
        backHref: null,
    });

    useEffect(() => {
        if (!ctx) return;

        const prev = prevRef.current;
        if (prev.title === title && prev.backLabel === backLabel && prev.backHref === backHref) {
            return;
        }

        prevRef.current = { title, backLabel, backHref };
        ctx.setPageTitle(title, { backLabel: backLabel ?? undefined, backHref: backHref ?? undefined });

        return () => {
            ctx.setPageTitle(null);
        };
    }, [ctx, title, backLabel, backHref]);
}
