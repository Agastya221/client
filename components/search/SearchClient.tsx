"use client";

import BrowseExperience from "@/components/search/BrowseExperience";

export default function SearchClient({ genres }: { genres: string[] }) {
  return <BrowseExperience genres={genres} embedded={false} />;
}
