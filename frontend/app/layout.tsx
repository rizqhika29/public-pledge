import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { NetworkBanner } from "@/components/feedback";

export const metadata: Metadata = {
  title: { default: "Public Pledge · Stake a promise, let AI validators judge it", template: "%s · Public Pledge" },
  description:
    "Write a promise in plain language, lock GEN behind it, and point to public evidence. GenLayer's AI validators reach consensus on whether you kept it.",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
};

export const viewport: Viewport = {
  themeColor: "#0a0a10",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <Providers>
          <Navbar />
          <NetworkBanner />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
