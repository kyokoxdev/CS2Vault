"use client";

import { useEffect, useRef } from "react";
import styles from "./Landing.module.css";
import SteamLoginButton from "@/components/landing/SteamLoginButton";
import MockPriceTicker from "@/components/landing/MockPriceTicker";
import MockSparkline from "@/components/landing/MockSparkline";
import MockStatCard from "@/components/landing/MockStatCard";
import ScrollReveal from "@/components/landing/ScrollReveal";
import DataReveal from "@/components/landing/DataReveal";
import ItemShowcase from "@/components/landing/ItemShowcase";
import HeroCinematic from "@/components/landing/HeroCinematic";
import { FaChartPie, FaWallet, FaRobot, FaSteam, FaBoxOpen } from "react-icons/fa";
import { fadeInUp } from "@/lib/gsap";

export default function StartupPage() {
    const stepsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const steps = stepsRef.current?.querySelectorAll(`.${styles.step}`);
        steps?.forEach((step, i) => {
            fadeInUp(step, i * 0.2);
        });
    }, []);

    return (
        <main className={styles.landingPage} data-testid="landing-page">
            {/* Hero Section — cinematic with GSAP animations */}
            <HeroCinematic />

            {/* Features Section */}
            <ScrollReveal className={styles.scrollRevealBase}>
                <section className={styles.featuresSection} data-testid="features-section">
                    <MockPriceTicker />
                    <div className={styles.featuresContent}>
                        <h2 className={styles.featuresTitle}>Everything You Need for CS2 Trading</h2>
                        <div className={styles.featuresGrid}>
                            {/* Card 1: Real-Time Price Tracking */}
                            <ScrollReveal className={styles.scrollRevealBase} delay={0}>
                                <div className={styles.featureCard} data-testid="feature-card">
                                    <div className={styles.featureCardHeader}>
                                        <div className={styles.featureIcon}>
                                            <FaChartPie />
                                        </div>
                                        <h3 className={styles.featureCardTitle}>Real-Time Price Tracking</h3>
                                    </div>
                                    <p className={styles.featureCardDescription}>
                                        Monitor prices across CSFloat, Steam, and more. See trends at a glance.
                                    </p>
                                    <div className={styles.featureCardMock}>
                                        <div className={styles.mockStatRow}>
                                            <div className={styles.featureMetric}>
                                                <DataReveal value={12500} prefix="$" suffix="+" className={styles.featureMetricValue} />
                                                <span className={styles.featureMetricLabel}>Items Tracked</span>
                                            </div>
                                            <div className={styles.featureMetric}>
                                                <DataReveal value={60} suffix="s" delay={0.2} className={styles.featureMetricValue} />
                                                <span className={styles.featureMetricLabel}>Update Interval</span>
                                            </div>
                                            <div className={styles.featureMetric}>
                                                <DataReveal value={5} delay={0.4} className={styles.featureMetricValue} />
                                                <span className={styles.featureMetricLabel}>Data Sources</span>
                                            </div>
                                        </div>
                                        <MockSparkline />
                                    </div>
                                </div>
                            </ScrollReveal>

                            {/* Card 2: Portfolio Management */}
                            <ScrollReveal className={styles.scrollRevealBase} delay={100}>
                                <div className={styles.featureCard} data-testid="feature-card">
                                    <div className={styles.featureCardHeader}>
                                        <div className={styles.featureIcon}>
                                            <FaWallet />
                                        </div>
                                        <h3 className={styles.featureCardTitle}>Portfolio Management</h3>
                                    </div>
                                    <p className={styles.featureCardDescription}>
                                        Track your inventory value in real-time. Know exactly what your items are worth.
                                    </p>
                                    <div className={styles.featureCardMock}>
                                        <div className={styles.mockStatRow}>
                                            <MockStatCard label="Portfolio Value" value="$2,450" trend="up" />
                                            <MockStatCard label="24h Change" value="+$180" trend="up" />
                                            <MockStatCard label="Items" value="47" trend="up" />
                                        </div>
                                    </div>
                                </div>
                            </ScrollReveal>

                            {/* Card 3: AI Market Insights */}
                            <ScrollReveal className={styles.scrollRevealBase} delay={200}>
                                <div className={styles.featureCard} data-testid="feature-card">
                                    <div className={styles.featureCardHeader}>
                                        <div className={styles.featureIcon}>
                                            <FaRobot />
                                        </div>
                                        <h3 className={styles.featureCardTitle}>AI Market Insights</h3>
                                    </div>
                                    <p className={styles.featureCardDescription}>
                                        Get intelligent market analysis powered by AI. Make smarter trading decisions.
                                    </p>
                                    <div className={styles.featureCardMock}>
                                        <div className={styles.chatBubble}>
                                            <p className={styles.chatText}>
                                                Based on recent trends, the AK-47 Redline is likely to increase by 5-8% this week.
                                            </p>
                                            <div className={styles.typingIndicator}>
                                                <span className={styles.typingDot} />
                                                <span className={styles.typingDot} />
                                                <span className={styles.typingDot} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </ScrollReveal>
                        </div>
                    </div>
                </section>
            </ScrollReveal>

            {/* Item Showcase Section */}
            <ScrollReveal className={styles.scrollRevealBase}>
                <ItemShowcase />
            </ScrollReveal>

            {/* How It Works Section */}
            <section className={styles.howItWorksSection} data-testid="how-it-works-section">
                <div className={styles.howItWorksContent}>
                    <h2 className={styles.howItWorksTitle}>Get Started in 3 Simple Steps</h2>
                    <div className={styles.stepsContainer} ref={stepsRef}>
                        <div className={styles.step}>
                            <div className={styles.stepNumber}>01</div>
                            <div className={styles.stepCard}>
                                <div className={styles.stepIcon}>
                                    <FaSteam />
                                </div>
                                <h3 className={styles.stepTitle}>Sign In with Steam</h3>
                                <p className={styles.stepDescription}>
                                    Connect your Steam account securely. We never access your credentials.
                                </p>
                            </div>
                        </div>
                        <div className={styles.step}>
                            <div className={styles.stepNumber}>02</div>
                            <div className={styles.stepCard}>
                                <div className={styles.stepIcon}>
                                    <FaBoxOpen />
                                </div>
                                <h3 className={styles.stepTitle}>Import Your Inventory</h3>
                                <p className={styles.stepDescription}>
                                    Your CS2 items are automatically imported and tracked in real-time.
                                </p>
                            </div>
                        </div>
                        <div className={styles.step}>
                            <div className={styles.stepNumber}>03</div>
                            <div className={styles.stepCard}>
                                <div className={styles.stepIcon}>
                                    <FaChartPie />
                                </div>
                                <h3 className={styles.stepTitle}>Track &amp; Analyze</h3>
                                <p className={styles.stepDescription}>
                                    Monitor prices, manage your portfolio, and get AI-powered insights.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <ScrollReveal className={styles.scrollRevealBase}>
                <section className={styles.ctaSection} data-testid="cta-section">
                    <div className={styles.ctaGlow} aria-hidden="true" />
                    <div className={styles.ctaContent}>
                        <h2 className={styles.ctaTitle}>Ready to Level Up Your Trading?</h2>
                        <p className={styles.ctaSubtext}>
                            Join CS2Vault and start tracking your CS2 inventory today. Free to use.
                        </p>
                        <div className={styles.ctaActions}>
                            <SteamLoginButton />
                        </div>
                    </div>
                </section>
            </ScrollReveal>

            <footer className={styles.landingFooter} data-testid="landing-footer">
                <div className={styles.footerContent}>
                    <p className={styles.footerBrand}>
                        CS2Vault &copy; {new Date().getFullYear()}
                    </p>
                    <p className={styles.footerAttribution}>
                        Powered by Steam. CS2Vault is not affiliated with Valve Corporation. Counter-Strike 2, CS2, and Steam are trademarks of Valve Corporation.
                    </p>
                </div>
            </footer>
        </main>
    );
}
