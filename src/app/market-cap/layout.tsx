import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Market Cap",
};

export default function MarketCapLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
