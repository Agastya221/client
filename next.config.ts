import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  images: {
    minimumCacheTTL: 604800,
    qualities: [45, 55, 60, 65, 70, 75, 90],
    remotePatterns: [
      { protocol: "https", hostname: "s4.anilist.co" },
      { protocol: "https", hostname: "img.anili.st" },
      { protocol: "https", hostname: "static.anikai.to" },
      { protocol: "https", hostname: "img.desidub.com" },
      { protocol: "https", hostname: "i.ibb.co" },
      { protocol: "https", hostname: "i.ibb.co.com" },
      { protocol: "https", hostname: "media.kitsu.app" },
      { protocol: "https", hostname: "static.tvmaze.com" },
      { protocol: "https", hostname: "static.wikia.nocookie.net" },
      { protocol: "https", hostname: "gogocdn.net" },
      { protocol: "https", hostname: "artworks.thetvdb.com", pathname: "/banners/**" },
      { protocol: "https", hostname: "placehold.co" },
    ],
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    webpackMemoryOptimizations: true,
  },
  // Suppress hydration warnings from browser extensions that inject attributes
  // like bis_skin_checked="1" (Honey, CouponFollow, etc.) into the DOM.
  reactStrictMode: true,
};

export default nextConfig;
