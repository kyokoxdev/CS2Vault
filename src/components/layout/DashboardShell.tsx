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
        <div className="app-shell">
            {/* Sidebar */}
            <aside className="sidebar">
                <div className="sidebar-brand">
                    <h1>CS2Vault</h1>
                    <span className="version">v0.1</span>
                </div>

                <nav className="sidebar-nav">
                    <div className="nav-section-label">Dashboard</div>
                    {NAV_ITEMS.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`nav-link ${pathname === item.href ? "active" : ""}`}
                        >
                            <span className="icon">{item.icon}</span>
                            {item.label}
                        </Link>
                    ))}

                    <div className="nav-section-label">Tools</div>
                    {NAV_TOOLS.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`nav-link ${pathname === item.href ? "active" : ""}`}
                        >
                            <span className="icon">{item.icon}</span>
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    {isLoading ? (
                        <div className="sidebar-user">
                            <div>
                                <div className="user-name" style={{ opacity: 0.5 }}>Loading...</div>
                            </div>
                        </div>
                    ) : isSignedIn ? (
                        <div className="sidebar-user">
                            {session.user?.image && (
                                <img
                                    src={session.user.image}
                                    alt={session.user.name ?? "User"}
                                    style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: 8,
                                        objectFit: "cover",
                                    }}
                                />
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="user-name" style={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}>
                                    {session.user?.name}
                                </div>
                                <button
                                    onClick={() => signOut()}
                                    style={{
                                        background: "none",
                                        border: "none",
                                        color: "var(--text-muted)",
                                        cursor: "pointer",
                                        padding: 0,
                                        fontSize: 11,
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
                                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                                >
                                    Sign out
                                </button>
                            </div>
                        </div>
                    ) : (
                        <Link
                            href="/api/auth/steam/login"
                            className="sidebar-user"
                            style={{
                                textDecoration: "none",
                                cursor: "pointer",
                                transition: "background 0.15s",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-tertiary)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                            <div
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 8,
                                    background: "var(--bg-tertiary)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 18,
                                }}
                            >
                                🎮
                            </div>
                            <div>
                                <div className="user-name">Sign in with Steam</div>
                                <div className="user-status">Login to sync inventory</div>
                            </div>
                        </Link>
                    )}
                </div>
            </aside>

            {/* Main */}
            <main className="main-content">
                <header className="main-header">
                    <h2>{pageTitle}</h2>
                </header>
                <div className="main-body">{children}</div>
            </main>
        </div>
    );
}
