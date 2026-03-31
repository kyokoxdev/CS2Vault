import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import DashboardShell from "@/components/layout/DashboardShell";
import SessionProvider from "@/components/providers/SessionProvider";
import ToastProvider from "@/components/providers/ToastProvider";
import PageTitleProvider from "@/components/providers/PageTitleProvider";
import { SpeedInsights } from "@vercel/speed-insights/next";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "CS2Vault — Market Intelligence Dashboard",
  description:
    "Track CS2 item prices, manage your inventory, and get AI-powered market insights.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body>
        <a href="#main-content" className="skip-link">Skip to content</a>
        <SessionProvider>
          <ToastProvider>
            <PageTitleProvider>
              <DashboardShell>{children}</DashboardShell>
            </PageTitleProvider>
          </ToastProvider>
        </SessionProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
