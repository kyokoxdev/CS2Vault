"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import pkg from "../../../package.json";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
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
  FaArrowLeft,
  FaSearch,
} from "react-icons/fa";
import styles from "./DashboardShell.module.css";
import { usePageTitleContext } from "@/components/providers/PageTitleProvider";
import { useUiPreferences } from "@/components/providers/UiPreferencesProvider";
import CommandPalette from "@/components/ui/CommandPalette";
import { AEGIS_ITEM_SELECTED_EVENT } from "@/lib/ai/item-mentions";

const NAV_ITEMS = [
  { href: "/", label: "Market Overview", icon: <FaChartPie /> },
  { href: "/market-cap", label: "Market Cap", icon: <FaChartLine /> },
  { href: "/watchlist", label: "Watchlist", icon: <FaEye /> },
  { href: "/portfolio", label: "Portfolio", icon: <FaWallet /> },
] as const;

const NAV_TOOLS = [
  { href: "/intelligence", label: "Intelligence", icon: <FaChartLine /> },
  { href: "/chat", label: "Aegis", icon: <FaRobot /> },
  { href: "/settings", label: "Settings", icon: <FaCog /> },
] as const;

interface PageHeaderContent {
  title: string;
  description?: string;
}

interface TapeMover {
  id: string;
  name: string;
  price: number;
  change24h: number;
}

interface TopMoversPayload {
  success: boolean;
  data?: {
    gainers?: TapeMover[];
    losers?: TapeMover[];
  };
}

interface TapeGroupProps {
  ariaHidden?: boolean;
  duplicate?: boolean;
  items: TapeMover[];
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
    title: "Aegis",
    description: "Forecast value, analyze volume, and optimize risk with Aegis.",
  },
  "/settings": { title: "Settings" },
};

function formatPrice(price: number): string {
  if (!Number.isFinite(price)) {
    return "$--";
  }

  return price.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(change24h: number): string {
  if (!Number.isFinite(change24h)) {
    return "--";
  }

  return `${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%`;
}

function calculateApproximateDollarChange(price: number, change24h: number): number | null {
  if (!Number.isFinite(price) || !Number.isFinite(change24h) || change24h === -100) {
    return null;
  }

  const divisor = 1 + change24h / 100;
  if (!Number.isFinite(divisor) || divisor === 0) {
    return null;
  }

  const previousPrice = price / divisor;
  const dollarChange = price - previousPrice;

  return Number.isFinite(previousPrice) && Number.isFinite(dollarChange)
    ? dollarChange
    : null;
}

function formatApproximateDollarChange(price: number, change24h: number): string {
  const dollarChange = calculateApproximateDollarChange(price, change24h);

  if (dollarChange === null) {
    return "approx --";
  }

  return `approx ${dollarChange >= 0 ? "+" : "-"}${formatPrice(Math.abs(dollarChange))}`;
}

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [tapeItems, setTapeItems] = useState<TapeMover[]>([]);
  const [tapeStatus, setTapeStatus] = useState<"loading" | "ready" | "error">("loading");
  const commandPalettePreviousFocus = useRef<HTMLElement | null>(null);
  const { title: contextTitle, backLabel, backHref } = usePageTitleContext();
  const { preferences, isHydrated: isPreferencesHydrated } = useUiPreferences();

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const openCommandPalette = useCallback(() => {
    commandPalettePreviousFocus.current = document.activeElement as HTMLElement;
    setCommandPaletteOpen(true);
  }, []);

  const closeCommandPalette = useCallback(() => {
    setCommandPaletteOpen(false);
    setTimeout(() => {
      commandPalettePreviousFocus.current?.focus();
      commandPalettePreviousFocus.current = null;
    }, 0);
  }, []);

  const handlePaletteSelect = useCallback(
    (item: {
      id?: string | null;
      hashName: string;
      name: string;
      imageUrl: string | null;
      category: string;
      rarity: string | null;
      exterior: string | null;
      type: string | null;
    }) => {
      if (pathname === "/chat") {
        commandPalettePreviousFocus.current = null;
        window.dispatchEvent(new CustomEvent(AEGIS_ITEM_SELECTED_EVENT, {
          detail: item,
        }));
        return;
      }

      if (!item.id) {
        return;
      }

      router.push(`/item/${encodeURIComponent(item.id)}`);
    },
    [pathname, router]
  );

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        const target = event.target;
        const targetElement = target instanceof Element ? target : null;
        const tag = targetElement?.tagName;
        const isAegisCommandTarget = targetElement?.getAttribute("data-aegis-command-target") === "true";

        if (!isAegisCommandTarget && (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT")) {
          return;
        }

        event.preventDefault();
        openCommandPalette();
      }
    }

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [openCommandPalette]);

  useEffect(() => {
    let active = true;

    if (pathname === "/startup" || !isPreferencesHydrated || !preferences.marketTapeVisible) {
      setTapeItems([]);
      setTapeStatus("loading");

      return () => {
        active = false;
      };
    }

    async function loadTopMovers() {
      try {
        const response = await fetch("/api/market/top-movers");
        const payload = (await response.json()) as TopMoversPayload;

        if (!active) {
          return;
        }

        if (!response.ok || !payload.success) {
          setTapeItems([]);
          setTapeStatus("error");
          return;
        }

        const combined = [...(payload.data?.gainers ?? []), ...(payload.data?.losers ?? [])]
          .filter((item) => item && item.id && item.name)
          .sort((left, right) => Math.abs(right.change24h) - Math.abs(left.change24h));

        setTapeItems(combined);
        setTapeStatus("ready");
      } catch {
        if (!active) {
          return;
        }

        setTapeItems([]);
        setTapeStatus("error");
      }
    }

    void loadTopMovers();

    return () => {
      active = false;
    };
  }, [isPreferencesHydrated, pathname, preferences.marketTapeVisible]);

  const renderTapeGroup = useCallback(({ ariaHidden = false, duplicate = false, items }: TapeGroupProps) => (
    <div
      aria-hidden={ariaHidden ? "true" : undefined}
      className={`${styles.marketTickerGroup}${duplicate ? ` ${styles.marketTickerDuplicateGroup}` : ""}`}
      data-testid={duplicate ? "shell-market-ticker-group-duplicate" : "shell-market-ticker-group-primary"}
    >
      {items.map((item) => {
        const dollarChange = calculateApproximateDollarChange(item.price, item.change24h);
        const toneClass = item.change24h >= 0 ? styles.tapePositive : styles.tapeNegative;
        const deltaToneClass =
          dollarChange === null
            ? ""
            : dollarChange >= 0
              ? styles.tapePositive
              : styles.tapeNegative;

        return (
          <Link
            key={`${duplicate ? "duplicate" : "primary"}-${item.id}`}
            href={`/item/${encodeURIComponent(item.id)}`}
            className={styles.marketTickerItem}
            tabIndex={duplicate ? -1 : undefined}
          >
            <span className={styles.tapeName}>{item.name}</span>
            <span className={styles.tapePrice}>{formatPrice(item.price)}</span>
            <span className={`${styles.tapeChange} ${toneClass}`}>{formatPercent(item.change24h)}</span>
            <span className={`${styles.tapeDelta} ${deltaToneClass}`}>{formatApproximateDollarChange(item.price, item.change24h)}</span>
          </Link>
        );
      })}
    </div>
  ), []);

  const pageHeader = PAGE_HEADERS[pathname];
  const pageTitle = contextTitle ?? pageHeader?.title ?? "CS2Vault";
  const pageDescription = contextTitle ? undefined : pageHeader?.description;
  const isLoading = status === "loading";
  const isSignedIn = !!session?.user;
  const showMarketTape = isPreferencesHydrated && preferences.marketTapeVisible;
  const isImmersivePage = pathname === "/chat";

  useEffect(() => {
    if (pathname === "/startup") {
      return;
    }

    if (pageTitle && pageTitle !== "CS2Vault") {
      document.title = `${pageTitle} | CS2Vault`;
    } else {
      document.title = "CS2Vault — Market Intelligence Dashboard";
    }
  }, [pageTitle, pathname]);

  if (pathname === "/startup") {
    return <>{children}</>;
  }


  return (
    <div className={styles.appShell} data-testid="dashboard-shell">
      {sidebarOpen ? (
        <button
          type="button"
          className={styles.sidebarOverlay}
          onClick={closeSidebar}
          aria-label="Close sidebar backdrop"
        />
      ) : null}

      <aside
        id="shell-sidebar"
        data-testid="shell-sidebar"
        className={`${styles.sidebar}${sidebarOpen ? ` ${styles.open}` : ""}`}
      >
        <div className={styles.sidebarBrand}>
          <div className={styles.sidebarBrandTopRow}>
            <button
              type="button"
              className={styles.sidebarCloseBtn}
              onClick={closeSidebar}
              aria-label="Close sidebar"
            >
              <FaTimes />
            </button>
          </div>
          <div className={styles.brandHeadlineRow}>
            <h1>CS2Vault</h1>
            <span className={styles.version}>v{pkg.version}</span>
          </div>
        </div>

        <nav className={styles.sidebarNav}>
          <div className={styles.navSectionLabel}>Market</div>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navLink} ${pathname === item.href ? styles.navLinkActive : ""}`}
              onClick={closeSidebar}
            >
              <span className={styles.icon}>{item.icon}</span>
              <span className={styles.navTextBlock}>
                <span className={styles.navLabel}>{item.label}</span>
              </span>
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
              <span className={styles.navTextBlock}>
                <span className={styles.navLabel}>{item.label}</span>
              </span>
            </Link>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          {isLoading ? (
            <div className={styles.sidebarUser}>
              <div className={styles.userInfo}>
                <div className={styles.userDeskLabel}>Account</div>
                <div className={`${styles.userName} ${styles.userNameLoading}`}>Loading...</div>
              </div>
            </div>
          ) : isSignedIn ? (
            <div className={styles.sidebarUser}>
              {session.user?.image ? (
                <img
                  src={session.user.image}
                  alt={session.user?.name ?? "User"}
                  className={styles.userAvatar}
                  loading="lazy"
                  width={32}
                  height={32}
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <div className={styles.userAvatarPlaceholder} aria-hidden="true">
                  {session.user?.name?.slice(0, 1).toUpperCase() ?? "?"}
                </div>
              )}
              <div className={styles.userInfo}>
                <div className={styles.userDeskLabel}>Account</div>
                <div className={styles.userName}>{session.user?.name}</div>
                <button type="button" onClick={() => signOut()} className={styles.signOutBtn}>
                  Sign out
                </button>
              </div>
            </div>
          ) : (
            <Link href="/api/auth/steam/login" className={styles.sidebarUser}>
              <div className={styles.userAvatarPlaceholder}>
                <FaSteam style={{ fontSize: "1.5rem" }} />
              </div>
              <div className={styles.userInfo}>
                <div className={styles.userDeskLabel}>Account</div>
                <div className={styles.userName}>Sign in with Steam</div>
                <div className={styles.userStatus}>Login to sync inventory</div>
              </div>
            </Link>
          )}
        </div>
      </aside>

      <main id="main-content" className={styles.mainContent}>
        {!isImmersivePage && (
        <header className={styles.mainHeader} data-testid="shell-topbar">
          <div className={styles.headerRow}>
            <button
              type="button"
              data-testid="shell-mobile-menu-button"
              className={styles.menuBtn}
              onClick={() => setSidebarOpen((value) => !value)}
              aria-label={sidebarOpen ? "Close menu" : "Open menu"}
              aria-expanded={sidebarOpen}
              aria-controls="shell-sidebar"
            >
              {sidebarOpen ? <FaTimes /> : <FaBars />}
            </button>

            <div className={styles.headerTitleArea}>
              {backLabel && backHref ? (
                <Link href={backHref} className={styles.backLink}>
                  <FaArrowLeft />
                  {backLabel}
                </Link>
              ) : null}
              <h2>{pageTitle}</h2>
              {pageDescription ? <p className={styles.headerSubtitle}>{pageDescription}</p> : null}
            </div>

            <div className={styles.headerActions}>
              <button
                type="button"
                data-testid="item-command-trigger"
                className={styles.commandTrigger}
                onClick={openCommandPalette}
                aria-label="Search items (Cmd+K)"
              >
                <FaSearch className={styles.commandTriggerIcon} data-testid="global-command-trigger" />
                <span className={styles.commandTriggerLabel}>Search</span>
                <kbd className={styles.commandTriggerKbd}>⌘K</kbd>
              </button>
            </div>
          </div>

          {showMarketTape ? (
            <div data-testid="shell-market-ticker" className={styles.marketTicker}>
              <div className={styles.marketTickerViewport}>
                {tapeStatus === "ready" && tapeItems.length > 0 ? (
                  <div className={styles.marketTickerTrack} data-testid="shell-market-ticker-track">
                    {renderTapeGroup({ items: tapeItems })}
                    {renderTapeGroup({ ariaHidden: true, duplicate: true, items: tapeItems })}
                  </div>
                ) : (
                  <div className={styles.marketTickerFallback}>
                    {tapeStatus === "loading" ? "Loading top movers..." : "Top movers unavailable"}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </header>
        )}

        {isImmersivePage && (
          <button
            type="button"
            className={styles.immersiveMenuBtn}
            onClick={() => setSidebarOpen((value) => !value)}
            aria-label={sidebarOpen ? "Close menu" : "Open menu"}
            aria-expanded={sidebarOpen}
            aria-controls="shell-sidebar"
          >
            {sidebarOpen ? <FaTimes /> : <FaBars />}
          </button>
        )}

        <div className={`${styles.mainBody}${isImmersivePage ? ` ${styles.mainBodyImmersive}` : ""}`}>{children}</div>
      </main>

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={closeCommandPalette}
        onSelect={handlePaletteSelect}
      />
    </div>
  );
}
