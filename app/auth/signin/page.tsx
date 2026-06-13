import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";
import Navbar from "@/components/ui/Navbar";

export default async function SignInPage() {
  const session = await auth();
  if (session) redirect("/");

  return (
    <main className="min-h-screen bg-[#0a0b0c] text-[#eaeaea]">
      <Navbar />
      <div className="flex items-center justify-center min-h-[calc(100vh-64px)] px-4">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="relative rounded-3xl border border-white/8 bg-[#111215] overflow-hidden">
            {/* Glow */}
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-60 h-40 bg-[#02A9FF]/15 blur-[80px] rounded-full" />

            <div className="relative p-8 md:p-10">
              {/* Header */}
              <div className="text-center mb-8">
                <h1 className="text-3xl font-black text-white tracking-tight mb-2">
                  Welcome to <span className="text-[#ff5500]">AnimePlay</span>
                </h1>
                <p className="text-white/50 text-sm">
                  Sign in to track your progress, bookmark anime, and join the conversation.
                </p>
              </div>

              {/* Providers */}
              <div className="space-y-3">

                {/* AniList — only provider */}
                <form
                  action={async () => {
                    "use server";
                    await signIn("anilist", { redirectTo: "/" });
                  }}
                >
                  <button
                    type="submit"
                    id="btn-signin-anilist"
                    className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 hover:shadow-[0_0_24px_rgba(2,169,255,0.25)] active:scale-[0.98]"
                    style={{ backgroundColor: "#02A9FF" }}
                  >
                    {/* AniList logo */}
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6.361 2.943L0 21.056h4.942l1.077-3.133H11.4l1.077 3.133H17.5L11.14 2.943H6.36zm.607 11.474l2.068-6.618 2.07 6.618H6.968zm9.096 2.993V2.943h4.612v11.449l3.046 4.664H19.04l-2.973-1.646z" />
                    </svg>
                    Continue with AniList
                    <span className="ml-auto text-[10px] font-black bg-white/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Sync
                    </span>
                  </button>
                </form>
              </div>

              {/* AniList sync info */}
              <div className="mt-6 p-3 rounded-xl bg-[#02A9FF]/8 border border-[#02A9FF]/15">
                <p className="text-[11px] text-[#02A9FF]/80 text-center leading-relaxed">
                  🔗 <strong>Sign in with AniList</strong> to sync your watching list — continue right where you left off on any site.
                </p>
              </div>

              {/* Footer */}
              <div className="mt-6 text-center">
                <p className="text-white/30 text-[11px]">
                  By signing in, you agree to our Terms of Service and Privacy Policy.
                </p>
              </div>
            </div>
          </div>

          {/* Skip */}
          <div className="text-center mt-4">
            <a href="/" className="text-white/40 text-xs hover:text-white/60 transition-colors">
              ← Continue without signing in
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
