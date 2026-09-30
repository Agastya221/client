import NextAuth, { customFetch } from "next-auth";
import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { anilistFetch, anilistOAuthFetch } from "@/lib/anilist/endpoint";

// AniList OAuth2 provider
function AniList(options: OAuthUserConfig<{ id: number; name: string; avatar: { large: string }; bannerImage: string | null }>): OAuthConfig<{ id: number; name: string; avatar: { large: string }; bannerImage: string | null }> {
  return {
    id: "anilist",
    name: "AniList",
    type: "oauth",
    client: {
      token_endpoint_auth_method: "client_secret_post",
    },
    authorization: {
      url: "https://anilist.co/api/v2/oauth/authorize",
      params: { response_type: "code", scope: "" },
    },
    token: "https://anilist.co/api/v2/oauth/token",
    userinfo: {
      url: "https://graphql.anilist.co",
      async request({ tokens }: { tokens: { access_token?: string } }) {
        const res = await anilistFetch({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tokens.access_token}`,
          },
          body: JSON.stringify({
            query: `query { Viewer { id name avatar { large } bannerImage } }`,
          }),
        });
        const json = await res.json();
        return json.data?.Viewer ?? {};
      },
    },
    profile(profile) {
      return {
        id: String(profile.id),
        name: profile.name || `AniList User`,
        email: null,
        image: profile.avatar?.large || null,
      };
    },
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    // The code-for-token exchange is blocked from Cloudflare Workers; see anilistOAuthFetch.
    [customFetch]: anilistOAuthFetch,
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
      clientId: process.env.ANILIST_CLIENT_ID,
      clientSecret: process.env.ANILIST_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async jwt({ token, account, user, profile }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      if (profile) {
        token.anilistId = String(profile.id);
      }
      if (user?.id && !token.sub) {
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      const appSession = session as typeof session & {
        accessToken?: string;
        anilistId?: string;
      };

      if (session.user && token) {
        // token.sub is the Prisma adapter User.id. The AniList profile ID is a
        // provider account identifier and cannot be used for database
        // relations such as Account, WatchHistory, Bookmark, or Comment.
        session.user.id = token.sub as string;
      }
      if (token.accessToken) {
        appSession.accessToken = token.accessToken as string;
      }
      if (token.anilistId) {
        appSession.anilistId = token.anilistId as string;
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
