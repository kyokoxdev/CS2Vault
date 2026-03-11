"use client";

import { type ReactNode } from "react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

interface ScrollRevealProps {
    children: ReactNode;
    className?: string;
    delay?: number;
}

export default function ScrollReveal({ children, className = "", delay = 0 }: ScrollRevealProps) {
    const { ref, isVisible } = useScrollReveal();

    return (
        <div
            ref={ref as React.RefObject<HTMLDivElement>}
            className={`${className}${isVisible ? " revealed" : ""}`}
            style={delay > 0 ? { transitionDelay: `${delay}ms` } : undefined}
            data-testid="scroll-reveal"
        >
            {children}
        </div>
    );
}
