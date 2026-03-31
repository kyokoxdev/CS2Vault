"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
    FaChartPie,
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

const NAV_ITEMS = [
    { href: "/", label: "Market Overview", icon: <FaChartPie /> },
    { href: "/watchlist", label: "Watchlist", icon: <FaEye /> },
    { href: "/portfolio", label: "Portfolio", icon: <FaWallet /> },
] as const;

const NAV_TOOLS = [
    { href: "/chat", label: "AI Insight", icon: <FaRobot /> },
    { href: "/settings", label: "Settings", icon: <FaCog /> },
] as const;

const PAGE_TITLES: Record<string, string> = {
    "/": "Market Overview",
    "/watchlist": "Watchlist",
    "/portfolio": "Portfolio",
    "/chat": "AI Insight",
    "/settings": "Settings",
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

    const pageTitle = contextTitle ?? PAGE_TITLES[pathname] ?? "CS2Vault";
    const isLoading = status === "loading";
    const isSignedIn = !!session?.user;

    return (
        <div className={styles.appShell}>
            {sidebarOpen && (
                <button
                    type="button"
                    className={styles.sidebarOverlay}
                    onClick={closeSidebar}
                    aria-label="Close sidebar"
                />
            )}

            {/* Sidebar */}
            <aside className={`${styles.sidebar}${sidebarOpen ? ` ${styles.open}` : ""}`}>
                <div className={styles.sidebarBrand}>
                    <h1>CS2Vault</h1>
                    <span className={styles.version}>v0.3</span>
                </div>

                <nav className={styles.sidebarNav}>
                    <div className={styles.navSectionLabel}>Dashboard</div>
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

                    <div className={styles.navSectionLabel}>Tools</div>
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
                    </div>
                </header>
                <div className={styles.mainBody}>
                    {children}
                </div>
            </main>
        </div>
    );
}
