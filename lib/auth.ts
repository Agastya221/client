import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Discord from "next-auth/providers/discord";
import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

// AniList OAuth2 provider
function AniList(options: OAuthUserConfig<{ id: number; name: { full: string }; avatar: { large: string }; bannerImage: string | null }>): OAuthConfig<{ id: number; name: { full: string }; avatar: { large: string }; bannerImage: string | null }> {
  return {
    id: "anilist",
    name: "AniList",
    type: "oauth",
    authorization: {
      url: "https://anilist.co/api/v2/oauth/authorize",
      params: { response_type: "code" },
    },
    token: "https://anilist.co/api/v2/oauth/token",
    userinfo: {
      // NextAuth v5 requires userinfo.url even when using a custom request function
      url: "https://graphql.anilist.co",
      async request({ tokens }: { tokens: { access_token?: string } }) {
        const res = await fetch("https://graphql.anilist.co", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tokens.access_token}`,
          },
          body: JSON.stringify({
            query: `query { Viewer { id name { full } avatar { large } bannerImage } }`,
          }),
        });
        const json = await res.json();
        return json.data?.Viewer ?? {};
      },
    },
    profile(profile) {
      return {
        id: String(profile.id),
        name: profile.name?.full || `AniList User`,
        email: null,
        image: profile.avatar?.large || null,
      };
    },
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    checks: ["state"],
    style: {
      logo: "https://anilist.co/img/icons/android-chrome-512x512.png",
      bg: "#02A9FF",
      text: "#fff",
    },
  };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),
    AniList({
      clientId: process.env.ANILIST_CLIENT_ID!,
      clientSecret: process.env.ANILIST_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
  trustHost: true,
});
