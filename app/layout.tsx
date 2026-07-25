import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Plus_Jakarta_Sans, Outfit, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import AuthSessionProvider from "@/components/ui/AuthSessionProvider";
import WatchHistorySyncClient from "@/components/anime/WatchHistorySyncClient";
import ScrollToTop from "@/components/ui/ScrollToTop";
import NavigationPendingController from "@/components/ui/NavigationPendingController";
import WatchPageLoading from "@/components/anime/WatchPageLoading";
import AnimeDetailLoading from "@/app/anime/[id]/loading";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
  weight: "variable",
});

const outfit = Outfit({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  weight: "variable",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#0a0b0c",
};

export const metadata: Metadata = {
  title: "AnimePlay | The Ultimate Anime Experience",
  description: "Watch your favorite anime online in high quality. Multi-provider streaming with sub, dub, and server fallback.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://animeplay.app"),
  openGraph: {
    title: "AnimePlay | The Ultimate Anime Experience",
    description: "Watch your favorite anime online in high quality with multi-provider streaming.",
    siteName: "AnimePlay",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AnimePlay | The Ultimate Anime Experience",
    description: "Watch your favorite anime online in high quality.",
  },
  icons: {
    icon: "/favicon.ico",
  },
};

import Navbar from "@/components/ui/Navbar";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${plusJakartaSans.variable} ${outfit.variable} ${geistMono.variable} antialiased bg-surface text-on-surface`}
        suppressHydrationWarning
      >
        <AuthSessionProvider>
          <WatchHistorySyncClient />
          <NavigationPendingController
            detailLoader={<AnimeDetailLoading />}
            watchLoader={<WatchPageLoading />}
          >
            <Navbar />
            <Suspense fallback={null}>
              <ScrollToTop />
            </Suspense>
            {children}
          </NavigationPendingController>
        </AuthSessionProvider>
        <Analytics />
      </body>
    </html>
  );
}

