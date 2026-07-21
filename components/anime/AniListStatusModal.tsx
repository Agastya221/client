"use client";

import AddToListButton from "@/components/anime/AddToListButton";

interface AniListStatusModalProps {
  animeId: string;
  title: string;
  poster?: string | null;
  totalEpisodes?: number | null;
  rawMediaId?: number | null;
}

export default function AniListStatusModal(props: AniListStatusModalProps) {
  return (
    <AddToListButton
      animeId={props.animeId}
      title={props.title}
      poster={props.poster || ""}
      href={`/anime/${props.animeId}`}
      totalEpisodes={props.totalEpisodes}
      rawMediaId={props.rawMediaId}
    />
  );
}
