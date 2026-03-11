import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "CS2Vault — Your CS2 Market Intelligence Hub",
    description: "Track prices, manage your portfolio, and get AI-powered insights for Counter-Strike 2 items.",
    openGraph: {
        title: "CS2Vault — Your CS2 Market Intelligence Hub",
        description: "Track prices, manage your portfolio, and get AI-powered insights for Counter-Strike 2 items.",
    },
};

export default function StartupLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
