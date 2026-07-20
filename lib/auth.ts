import NextAuth from "next-auth";
import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

// AniList OAuth2 provider
function AniList(options: OAuthUserConfig<{ id: number; name: { full: string }; avatar: { large: string }; bannerImage: string | null }>): OAuthConfig<{ id: number; name: { full: string }; avatar: { large: string }; bannerImage: string | null }> {
  return {
    id: "anilist",
    name: "AniList",
    type: "oauth",
    client: {
      token_endpoint_auth_method: "client_secret_post",
    },
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
    checks: ["none"],
    style: {
      logo: "https://anilist.co/img/icons/android-chrome-512x512.png",
      bg: "#02A9FF",
      text: "#fff",
    },
  };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "tatakai-animeplay-auth-secret-key-2026-default",
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    AniList({
      clientId: process.env.ANILIST_CLIENT_ID || "46437",
      clientSecret: process.env.ANILIST_CLIENT_SECRET || "BMczD5IzdYPLn3o4WSQKXnhGNVjlbJ7LBedTylcy",
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token) {
        session.user.id = (token.id as string) || (token.sub as string);
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/signin",
  },
  trustHost: true,
});
