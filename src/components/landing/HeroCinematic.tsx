"use client";

import { useRef, useState, useEffect, useLayoutEffect } from "react";
import gsap from "gsap";
import styles from "@/app/startup/Landing.module.css";
import ParallaxSection from "./ParallaxSection";
import DataReveal from "./DataReveal";
import SteamLoginButton from "./SteamLoginButton";
import { useReducedMotion } from "@/hooks/useMediaQuery";

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
    const hasAnimatedRef = useRef(false);
    const prefersReducedMotion = useReducedMotion();
    const [animationComplete, setAnimationComplete] = useState(false);

    // Animation runs once, no cleanup to prevent ctx.revert() from hiding animated elements
    useLayoutEffect(() => {
        if (typeof window === "undefined") return;
        if (prefersReducedMotion || hasAnimatedRef.current) return;

        hasAnimatedRef.current = true;

        gsap.context(() => {
            gsap.set(titleRef.current, { opacity: 0, y: 40 });
            gsap.set(".hero-stat-item", { opacity: 0, y: 30 });
            gsap.set(subtitleRef.current, { opacity: 0, y: 20 });
            gsap.set(ctaRef.current, { opacity: 0, scale: 0.9 });

            const tl = gsap.timeline({
                onComplete: () => setAnimationComplete(true),
            });

            tl.to(
                titleRef.current,
                { opacity: 1, y: 0, duration: 1, ease: "power3.out" },
                0
            );

            tl.to(
                ".hero-stat-item",
                { opacity: 1, y: 0, duration: 0.6, stagger: 0.25, ease: "power2.out" },
                1
            );

            tl.to(
                subtitleRef.current,
                { opacity: 1, y: 0, duration: 1, ease: "power2.out" },
                2.5
            );

            tl.to(
                ctaRef.current,
                { opacity: 1, scale: 1, duration: 0.8, ease: "back.out(1.4)" },
                4
            );
        }, containerRef);
    }, [prefersReducedMotion]);
    useEffect(() => {
        if (prefersReducedMotion) {
            setAnimationComplete(true);
        }
    }, [prefersReducedMotion]);

    const staticVisible = (prefersReducedMotion || animationComplete)
        ? { opacity: 1, transform: "none" }
        : undefined;

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
                    <h1
                        ref={titleRef}
                        className={styles.heroCinematicTitle}
                        style={staticVisible}
                    >
                        Your CS2 Market
                        <br />
                        <span className={styles.heroCinematicTitleAccent}>Intelligence Hub</span>
                    </h1>

                    <div
                        ref={statsRef}
                        className={styles.heroCinematicStats}
                        data-testid="hero-stats"
                    >
                        {HERO_STATS.map((stat) => (
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
                                        delay={prefersReducedMotion ? 0 : 1}
                                    />
                                </span>
                                <span className={styles.heroCinematicStatLabel}>{stat.label}</span>
                            </div>
                        ))}
                    </div>

                    <p
                        ref={subtitleRef}
                        className={styles.heroCinematicSubtitle}
                        style={staticVisible}
                    >
                        Stop guessing. Start knowing exactly what your skins are worth—and when to trade them.
                    </p>

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
