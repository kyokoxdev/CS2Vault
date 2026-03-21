"use client";

import { useRef, useState, useEffect } from "react";
import { gsap } from "@/lib/gsap";
import styles from "./DataReveal.module.css";

interface DataRevealProps {
    value: number;
    prefix?: string;
    suffix?: string;
    duration?: number;
    delay?: number;
    className?: string;
}

export default function DataReveal({
    value,
    prefix = "",
    suffix = "",
    duration = 1.5,
    delay = 0,
    className,
}: DataRevealProps) {
    const containerRef = useRef<HTMLSpanElement>(null);
    const valueRef = useRef<HTMLSpanElement>(null);
    const [hasAnimated, setHasAnimated] = useState(false);
    const [displayValue, setDisplayValue] = useState(0);
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        setPrefersReducedMotion(mq.matches);

        const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, []);

    useEffect(() => {
        if (prefersReducedMotion) {
            setDisplayValue(value);
            setHasAnimated(true);
        }
    }, [prefersReducedMotion, value]);

    useEffect(() => {
        const element = containerRef.current;
        if (!element || hasAnimated || prefersReducedMotion) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !hasAnimated) {
                    setHasAnimated(true);

                    const obj = { val: 0 };
                    gsap.to(obj, {
                        val: value,
                        duration,
                        delay,
                        ease: "power1.out",
                        onUpdate: () => {
                            setDisplayValue(Math.round(obj.val));
                        },
                        onComplete: () => {
                            setDisplayValue(value);
                        },
                    });
                }
            },
            { threshold: 0.3 }
        );

        observer.observe(element);
        return () => observer.disconnect();
    }, [value, duration, delay, hasAnimated, prefersReducedMotion]);

    return (
        <span
            ref={containerRef}
            className={`${styles.container} ${hasAnimated ? styles.revealed : ""} ${className ?? ""}`}
            data-testid="data-reveal"
        >
            {prefix && <span className={styles.prefix}>{prefix}</span>}
            <span ref={valueRef} className={styles.value}>
                {displayValue}
            </span>
            {suffix && <span className={styles.suffix}>{suffix}</span>}
        </span>
    );
}
