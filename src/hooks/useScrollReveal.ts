"use client";

import { useEffect, useRef, useState } from "react";

interface ScrollRevealOptions {
    threshold?: number;
    rootMargin?: string;
    freezeOnceVisible?: boolean;
}

export function useScrollReveal(options: ScrollRevealOptions = {}) {
    const { threshold = 0.1, rootMargin = "0px", freezeOnceVisible = true } = options;
    const ref = useRef<HTMLElement | null>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const element = ref.current;
        if (!element || typeof IntersectionObserver === "undefined") return;

        // If already frozen visible, no need for observer
        if (freezeOnceVisible && isVisible) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                const isIntersecting = entry.isIntersecting;
                if (freezeOnceVisible) {
                    if (isIntersecting) setIsVisible(true);
                } else {
                    setIsVisible(isIntersecting);
                }
            },
            { threshold, rootMargin }
        );

        observer.observe(element);
        return () => observer.disconnect();
    }, [threshold, rootMargin, freezeOnceVisible, isVisible]);

    return { ref, isVisible };
}
