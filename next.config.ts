import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "s4.anilist.co" },
      { protocol: "https", hostname: "img.anili.st" },
      { protocol: "https", hostname: "static.anikai.to" },
      { protocol: "https", hostname: "img.desidub.com" },
      { protocol: "https", hostname: "i.ibb.co" },
      { protocol: "https", hostname: "i.ibb.co.com" },
      { protocol: "https", hostname: "media.kitsu.app" },
      { protocol: "https", hostname: "gogocdn.net" },
    ],
  },
};

export default nextConfig;
