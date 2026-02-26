"use client";

/**
 * App Shell Layout — Sidebar + Main Content Area
 *
 * Provides the persistent navigation sidebar and top header.
 * All dashboard pages render inside this shell.
 * Shows Steam login/logout and user info in the sidebar footer.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
    FaChartPie,
    FaWallet,
    FaBoxOpen,
    FaRobot,
    FaCog
} from 'react-icons/fa';
import styles from './DashboardShell.module.css';

const NAV_ITEMS = [
    { href: "/", label: "Market Overview", icon: <FaChartPie /> },
    { href: "/portfolio", label: "Portfolio", icon: <FaWallet /> },
] as const;

const NAV_TOOLS = [
    { href: "/chat", label: "AI Insight", icon: <FaRobot /> },
    { href: "/settings", label: "Settings", icon: <FaCog /> },
] as const;

const PAGE_TITLES: Record<string, string> = {
    "/": "Market Overview",
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

    // Don't wrap the /test page in the shell
    if (pathname === "/test") return <>{children}</>;

    const pageTitle = PAGE_TITLES[pathname] ?? "CS2Vault";
    const isLoading = status === "loading";
    const isSignedIn = !!session?.user;

    return (
        <div className={styles.appShell}>
            {/* Sidebar */}
            <aside className={styles.sidebar}>
                <div className={styles.sidebarBrand}>
                    <h1>CS2Vault</h1>
                    <span className={styles.version}>v0.1</span>
                </div>

                <nav className={styles.sidebarNav}>
                    <div className={styles.navSectionLabel}>Dashboard</div>
                    {NAV_ITEMS.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`${styles.navLink} ${pathname === item.href ? styles.navLinkActive : ""}`}
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
                                <div className={styles.userName} style={{ opacity: 0.5 }}>Loading...</div>
                            </div>
                        </div>
                    ) : isSignedIn ? (
                        <div className={styles.sidebarUser}>
                            {session.user?.image && (
                                <img
                                    src={session.user.image}
                                    alt={session.user.name ?? "User"}
                                    className={styles.userAvatar}
                                />
                            )}
                            <div className={styles.userInfo}>
                                <div className={styles.userName}>
                                    {session.user?.name}
                                </div>
                                <button
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
                                🎮
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
            <main className={styles.mainContent}>
                <header className={styles.mainHeader}>
                    <h2>{pageTitle}</h2>
                </header>
                <div className={styles.mainBody}>{children}</div>
            </main>
        </div>
    );
}
