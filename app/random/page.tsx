import { getAnilistTrending, encodeAnilistRouteId } from "@/lib/anilist/api";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RandomPage() {
  // Fetch trending anime and pick a random one
  const trending = await getAnilistTrending(50);

  if (trending.length === 0) {
    redirect("/search");
  }

  const randomIndex = Math.floor(Math.random() * trending.length);
  const pick = trending[randomIndex];
  const routeId = encodeAnilistRouteId(pick.id);

  redirect(`/anime/${routeId}`);
}
