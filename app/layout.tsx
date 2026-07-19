import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter, Geist_Mono } from "next/font/google";
import WatchHistorySyncClient from "@/components/anime/WatchHistorySyncClient";
import ScrollToTop from "@/components/ui/ScrollToTop";
import NavigationPendingController from "@/components/ui/NavigationPendingController";
import WatchPageLoading from "@/components/anime/WatchPageLoading";
import RootLoading from "@/app/loading";
import AnimeDetailLoading from "@/app/anime/[id]/loading";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${geistMono.variable} antialiased bg-surface text-on-surface`}
        suppressHydrationWarning
      >
        <WatchHistorySyncClient />
        <NavigationPendingController
          rootLoader={<RootLoading />}
          detailLoader={<AnimeDetailLoading />}
          watchLoader={<WatchPageLoading />}
        >
          <Suspense fallback={null}>
            <ScrollToTop />
          </Suspense>
          {children}
        </NavigationPendingController>
      </body>
    </html>
  );
}
