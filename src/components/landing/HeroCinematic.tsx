"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import styles from "@/app/startup/Landing.module.css";
import ParallaxSection from "./ParallaxSection";
import DataReveal from "./DataReveal";
import SteamLoginButton from "./SteamLoginButton";

interface HeroStat {
    value: number;
    prefix?: string;
    suffix?: string;
    label: string;
}

const HERO_STATS: HeroStat[] = [
    { value: 2.5, prefix: "$", suffix: "B", label: "Total market tracked" },
    { value: 50, suffix: "K+", label: "Items monitored" },
    { value: 24, suffix: "/7", label: "Real-time updates" },
];

export default function HeroCinematic() {
    const containerRef = useRef<HTMLElement>(null);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const statsRef = useRef<HTMLDivElement>(null);
    const subtitleRef = useRef<HTMLParagraphElement>(null);
    const ctaRef = useRef<HTMLDivElement>(null);
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
    const [hasAnimated, setHasAnimated] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        setPrefersReducedMotion(mq.matches);

        const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, []);

    const animateHero = useCallback((ctx: gsap.Context) => {
        if (prefersReducedMotion || hasAnimated) return;
        
        const tl = gsap.timeline({
            onComplete: () => setHasAnimated(true),
        });

        // Beat 1 (0-1s): Title fade in with slight translate
        tl.fromTo(
            titleRef.current,
            { opacity: 0, y: 40 },
            { opacity: 1, y: 0, duration: 1, ease: "power3.out" },
            0
        );

        // Beat 2 (1-2.5s): Data points reveal (staggered)
        tl.fromTo(
            ".hero-stat-item",
            { opacity: 0, y: 30 },
            { opacity: 1, y: 0, duration: 0.6, stagger: 0.25, ease: "power2.out" },
            1
        );

        // Beat 3 (2.5-4s): Subtitle and value proposition appear
        tl.fromTo(
            subtitleRef.current,
            { opacity: 0, y: 20 },
            { opacity: 1, y: 0, duration: 1, ease: "power2.out" },
            2.5
        );

        // Beat 4 (4-5s): CTA button emerges with emphasis
        tl.fromTo(
            ctaRef.current,
            { opacity: 0, scale: 0.9 },
            { opacity: 1, scale: 1, duration: 0.8, ease: "back.out(1.4)" },
            4
        );

        return tl;
    }, [prefersReducedMotion, hasAnimated]);

    useGSAP(
        (ctx) => {
            if (prefersReducedMotion || hasAnimated) return;
            animateHero(ctx);
        },
        [prefersReducedMotion, hasAnimated],
        containerRef
    );

    // Prevent ctx.revert() from hiding elements after animation completes
    const staticVisible = (prefersReducedMotion || hasAnimated) ? { opacity: 1, transform: "none", visibility: "visible" as const } : { opacity: 0 };

    const backgroundLayers = [
        {
            content: <div className={styles.meshGradient} aria-hidden="true" />,
            depth: 1 as const,
            speed: 0.3,
        },
        {
            content: <div className={styles.gridOverlay} aria-hidden="true" />,
            depth: 2 as const,
            speed: 0.5,
        },
    ];

    return (
        <ParallaxSection layers={backgroundLayers} className={styles.heroParallax}>
            <section
                ref={containerRef}
                className={styles.heroCinematic}
                data-testid="hero-cinematic"
            >
                <div className={styles.heroCinematicContent}>
                    {/* Beat 1: Title */}
                    <h1
                        ref={titleRef}
                        className={styles.heroCinematicTitle}
                        style={staticVisible}
                    >
                        Your CS2 Market
                        <br />
                        <span className={styles.heroCinematicTitleAccent}>Intelligence Hub</span>
                    </h1>

                    {/* Beat 2: Stats */}
                    <div
                        ref={statsRef}
                        className={styles.heroCinematicStats}
                        data-testid="hero-stats"
                    >
                        {HERO_STATS.map((stat, index) => (
                            <div
                                key={stat.label}
                                className={`${styles.heroCinematicStatItem} hero-stat-item`}
                                style={staticVisible}
                            >
                                <span className={styles.heroCinematicStatValue}>
                                    <DataReveal
                                        value={stat.value}
                                        prefix={stat.prefix}
                                        suffix={stat.suffix}
                                        duration={1.2}
                                        delay={prefersReducedMotion ? 0 : 1 + index * 0.25}
                                    />
                                </span>
                                <span className={styles.heroCinematicStatLabel}>
                                    {stat.label}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Beat 3: Subtitle */}
                    <p
                        ref={subtitleRef}
                        className={styles.heroCinematicSubtitle}
                        style={staticVisible}
                    >
                        Stop guessing. Start knowing exactly what your skins are worth—and when to trade them.
                    </p>

                    {/* Beat 4: CTA */}
                    <div
                        ref={ctaRef}
                        className={styles.heroCinematicCta}
                        style={staticVisible}
                        data-testid="hero-cta"
                    >
                        <SteamLoginButton />
                    </div>
                </div>

                <div className={styles.scrollIndicator} aria-hidden="true">
                    <span className={styles.scrollChevron}>↓</span>
                </div>
            </section>
        </ParallaxSection>
    );
}
