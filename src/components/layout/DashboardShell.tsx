"use client";

import { useState, useCallback } from "react";
import pkg from "../../../package.json";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
    FaChartPie,
    FaChartLine,
    FaWallet,
    FaEye,
    FaRobot,
    FaCog,
    FaSteam,
    FaBars,
    FaTimes,
    FaArrowLeft
} from 'react-icons/fa';
import styles from './DashboardShell.module.css';
import { usePageTitleContext } from "@/components/providers/PageTitleProvider";
import { PageTransition } from "@/components/ui/PageTransition";
import { StaggerList, FadeIn } from "@/components/ui/Motion";

const NAV_ITEMS = [
    { href: "/", label: "Market Overview", icon: <FaChartPie /> },
    { href: "/market-cap", label: "Market Cap", icon: <FaChartLine /> },
    { href: "/watchlist", label: "Watchlist", icon: <FaEye /> },
    { href: "/portfolio", label: "Portfolio", icon: <FaWallet /> },
] as const;

const NAV_TOOLS = [
    { href: "/intelligence", label: "Intelligence", icon: <FaChartLine /> },
    { href: "/chat", label: "AI Insight", icon: <FaRobot /> },
    { href: "/settings", label: "Settings", icon: <FaCog /> },
] as const;

interface PageHeaderContent {
    title: string;
    description?: string;
}

const PAGE_HEADERS: Record<string, PageHeaderContent> = {
    "/": { title: "Market Overview" },
    "/market-cap": { title: "Market Cap" },
    "/watchlist": {
        title: "Your Watchlist",
        description: "Track CS2 item prices and market movements",
    },
    "/portfolio": {
        title: "Your Portfolio",
        description: "Track your CS2 inventory value and profit/loss",
    },
    "/intelligence": {
        title: "Intelligence",
        description: "Advisory signals only",
    },
    "/chat": {
        title: "AI Insight",
        description: "Chat with the CS2 Market AI Agent.",
    },
    "/settings": { title: "Settings" },
};

export default function DashboardShell({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const { data: session, status } = useSession();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const { title: contextTitle, backLabel, backHref } = usePageTitleContext();

    const closeSidebar = useCallback(() => setSidebarOpen(false), []);

    if (pathname === "/startup") return <>{children}</>;

    const pageHeader = PAGE_HEADERS[pathname];
    const pageTitle = contextTitle ?? pageHeader?.title ?? "CS2Vault";
    const pageDescription = contextTitle ? undefined : pageHeader?.description;
    const isLoading = status === "loading";
    const isSignedIn = !!session?.user;

    return (
        <div className={styles.appShell}>
            <AnimatePresence>
                {sidebarOpen && (
                    <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        type="button"
                        className={styles.sidebarOverlay}
                        onClick={closeSidebar}
                        aria-label="Close sidebar"
                    />
                )}
            </AnimatePresence>

            {/* Sidebar */}
            <aside className={`${styles.sidebar}${sidebarOpen ? ` ${styles.open}` : ""}`}>
                <div className={styles.sidebarBrand}>
                    <h1>CS2Vault</h1>
                    <span className={styles.version}>v{pkg.version}</span>
                </div>

                <nav className={styles.sidebarNav}>
                    <div className={styles.navSectionLabel}>Dashboard</div>
                    <StaggerList staggerDelay={0.03} keys={NAV_ITEMS.map(i => i.href)}>
                        {NAV_ITEMS.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`${styles.navLink} ${pathname === item.href ? styles.navLinkActive : ""}`}
                                onClick={closeSidebar}
                            >
                                <span className={styles.icon}>{item.icon}</span>
                                {item.label}
                            </Link>
                        ))}
                    </StaggerList>

                    <div className={styles.navSectionLabel} style={{ marginTop: '16px' }}>Tools</div>
                    <StaggerList staggerDelay={0.03} keys={NAV_TOOLS.map(i => i.href)}>
                        {NAV_TOOLS.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`${styles.navLink} ${pathname === item.href ? styles.navLinkActive : ""}`}
                                onClick={closeSidebar}
                            >
                                <span className={styles.icon}>{item.icon}</span>
                                {item.label}
                            </Link>
                        ))}
                    </StaggerList>
                </nav>

                <div className={styles.sidebarFooter}>
                    {isLoading ? (
                        <div className={styles.sidebarUser}>
                            <div className={styles.userInfo}>
                                <div className={`${styles.userName} ${styles.userNameLoading}`}>Loading...</div>
                            </div>
                        </div>
                    ) : isSignedIn ? (
                        <div className={styles.sidebarUser}>
                            <img
                                src={session.user?.image || ""}
                                alt={session.user?.name ?? "User"}
                                className={styles.userAvatar}
                                loading="lazy"
                                width={32}
                                height={32}
                                onError={(e) => {
                                    const target = e.currentTarget;
                                    target.style.display = "none";
                                }}
                            />
                            <div className={styles.userInfo}>
                                <div className={styles.userName}>
                                    {session.user?.name}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => signOut()}
                                    className={styles.signOutBtn}
                                >
                                    Sign out
                                </button>
                            </div>
                        </div>
                    ) : (
                        <Link
                            href="/api/auth/steam/login"
                            className={styles.sidebarUser}
                        >
                            <div className={styles.userAvatarPlaceholder}>
                                <FaSteam style={{ fontSize: '1.5rem' }} />
                            </div>
                            <div className={styles.userInfo}>
                                <div className={styles.userName}>Sign in with Steam</div>
                                <div className={styles.userStatus}>Login to sync inventory</div>
                            </div>
                        </Link>
                    )}
                </div>
            </aside>

            {/* Main */}
            <main id="main-content" className={styles.mainContent}>
                <FadeIn duration={0.4}>
                    <header className={styles.mainHeader}>
                        <button
                            type="button"
                            className={styles.menuBtn}
                            onClick={() => setSidebarOpen((v) => !v)}
                            aria-label={sidebarOpen ? "Close menu" : "Open menu"}
                        >
                            {sidebarOpen ? <FaTimes /> : <FaBars />}
                        </button>
                        <div className={styles.headerTitleArea}>
                            {backLabel && backHref && (
                                <Link href={backHref} className={styles.backLink}>
                                    <FaArrowLeft />
                                    {backLabel}
                                </Link>
                            )}
                            <h2>{pageTitle}</h2>
                            {pageDescription && (
                                <p className={styles.headerSubtitle}>{pageDescription}</p>
                            )}
                        </div>
                    </header>
                </FadeIn>
                <div className={styles.mainBody}>
                    <PageTransition>
                        {children}
                    </PageTransition>
                </div>
            </main>
        </div>
    );
}
