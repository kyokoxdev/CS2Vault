/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardShell from "../../src/components/layout/DashboardShell";
import { usePathname } from "next/navigation";
import "../setup-component";

// Mock next/navigation
vi.mock("next/navigation", () => ({
    usePathname: vi.fn(),
}));

// Mock next-auth/react
vi.mock("next-auth/react", () => ({
    useSession: vi.fn(() => ({ data: null, status: "unauthenticated" })),
    signOut: vi.fn(),
}));

// Mock react-icons/fa
vi.mock("react-icons/fa", () => ({
    FaChartPie: () => <span data-testid="icon-chart">icon</span>,
    FaWallet: () => <span data-testid="icon-wallet">icon</span>,
    FaBoxOpen: () => <span data-testid="icon-box">icon</span>,
    FaRobot: () => <span data-testid="icon-robot">icon</span>,
    FaCog: () => <span data-testid="icon-cog">icon</span>,
    FaSteam: () => <span data-testid="icon-steam">icon</span>,
}));

// Mock next/link
vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

describe("DashboardShell", () => {
    beforeEach(() => {
        vi.mocked(usePathname).mockReturnValue("/");
    });

    it("renders nav links for Market Overview and Portfolio", () => {
        render(
            <DashboardShell>
                <div>Content</div>
            </DashboardShell>
        );

        const marketOverviewElements = screen.getAllByText("Market Overview");
        expect(marketOverviewElements.length).toBeGreaterThan(0);
        expect(marketOverviewElements[0]).toBeInTheDocument();
        expect(screen.getByText("Portfolio")).toBeInTheDocument();
    });

    it("renders Sign in with Steam when not authenticated", () => {
        render(
            <DashboardShell>
                <div>Content</div>
            </DashboardShell>
        );

        expect(screen.getByText("Sign in with Steam")).toBeInTheDocument();
    });

    it("renders children in main body", () => {
        render(
            <DashboardShell>
                <div data-testid="child-content">Child Content</div>
            </DashboardShell>
        );

        expect(screen.getByTestId("child-content")).toBeInTheDocument();
        expect(screen.getByText("Child Content")).toBeInTheDocument();
    });

    it("does not render shell for /test route (just returns children)", () => {
        vi.mocked(usePathname).mockReturnValue("/test");
        const { container } = render(
            <DashboardShell>
                <div data-testid="child-content">Child Content</div>
            </DashboardShell>
        );

        expect(screen.getByTestId("child-content")).toBeInTheDocument();
        expect(container.querySelector("aside")).not.toBeInTheDocument();
        expect(container.querySelector("nav")).not.toBeInTheDocument();
    });
});
