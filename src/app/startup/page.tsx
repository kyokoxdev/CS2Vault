"use client";

import styles from "./Landing.module.css";
import SteamLoginButton from "@/components/landing/SteamLoginButton";
import MockPriceTicker from "@/components/landing/MockPriceTicker";
import MockSparkline from "@/components/landing/MockSparkline";
import MockStatCard from "@/components/landing/MockStatCard";
import ScrollReveal from "@/components/landing/ScrollReveal";
import { FaChartPie, FaWallet, FaRobot, FaSteam, FaBoxOpen } from "react-icons/fa";

export default function StartupPage() {
    return (
        <main className={styles.landingPage} data-testid="landing-page">
            {/* Hero Section — above the fold, no ScrollReveal */}
            <section className={styles.heroSection} data-testid="hero-section">
                <div className={styles.heroBackground}>
                    <div className={styles.meshGradient} />
                    <div className={styles.gridOverlay} />
                </div>
                <div className={styles.heroContent}>
                    <h1 className={styles.heroTitle}>Your CS2 Market Intelligence Hub</h1>
                    <p className={styles.heroSubtitle}>
                        Track prices, manage your portfolio, and get AI-powered insights for Counter-Strike 2 items.
                    </p>
                    <div className={styles.heroActions}>
                        <SteamLoginButton />
                    </div>
                </div>
                <div className={styles.scrollIndicator} aria-hidden="true">
                    <span className={styles.scrollChevron}>↓</span>
                </div>
            </section>

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

            {/* How It Works Section */}
            <ScrollReveal className={styles.scrollRevealBase}>
                <section className={styles.howItWorksSection} data-testid="how-it-works-section">
                    <div className={styles.howItWorksContent}>
                        <h2 className={styles.howItWorksTitle}>Get Started in 3 Simple Steps</h2>
                        <div className={styles.stepsContainer}>
                            <ScrollReveal className={styles.scrollRevealBase} delay={0}>
                                <div className={styles.step}>
                                    <div className={styles.stepNumberCircle}>1</div>
                                    <div className={styles.stepIcon}>
                                        <FaSteam />
                                    </div>
                                    <h3 className={styles.stepTitle}>Sign In with Steam</h3>
                                    <p className={styles.stepDescription}>
                                        Connect your Steam account securely. We never access your credentials.
                                    </p>
                                </div>
                            </ScrollReveal>
                            <ScrollReveal className={styles.scrollRevealBase} delay={150}>
                                <div className={styles.step}>
                                    <div className={styles.stepNumberCircle}>2</div>
                                    <div className={styles.stepIcon}>
                                        <FaBoxOpen />
                                    </div>
                                    <h3 className={styles.stepTitle}>Import Your Inventory</h3>
                                    <p className={styles.stepDescription}>
                                        Your CS2 items are automatically imported and tracked in real-time.
                                    </p>
                                </div>
                            </ScrollReveal>
                            <ScrollReveal className={styles.scrollRevealBase} delay={300}>
                                <div className={styles.step}>
                                    <div className={styles.stepNumberCircle}>3</div>
                                    <div className={styles.stepIcon}>
                                        <FaChartPie />
                                    </div>
                                    <h3 className={styles.stepTitle}>Track &amp; Analyze</h3>
                                    <p className={styles.stepDescription}>
                                        Monitor prices, manage your portfolio, and get AI-powered insights.
                                    </p>
                                </div>
                            </ScrollReveal>
                        </div>
                    </div>
                </section>
            </ScrollReveal>

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
