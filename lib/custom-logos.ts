// Verified official-site fallbacks for anime that lack a logo in artwork APIs.
// Key: AniList ID (number)
// Value: Direct HTTPS URL to a transparent PNG logo image
export const CUSTOM_TITLE_LOGOS: Record<number, string> = {
  184356: "https://tombraiderking-pr.com/core_sys/images/main/common/logo.png", // Tomb Raider King
  194829: "https://www.ossan-kensei.com/core_sys/images/main/common/logo.png", // From Old Country Bumpkin to Master Swordsman II
  200637: "https://static.wikia.nocookie.net/100kanojo/images/0/0b/100KanojoAnimeLogo.png", // The 100 Girlfriends Season 3
  172258: "https://static.wikia.nocookie.net/100kanojo/images/0/0b/100KanojoAnimeLogo.png", // The 100 Girlfriends Season 2
  162694: "https://static.wikia.nocookie.net/100kanojo/images/0/0b/100KanojoAnimeLogo.png", // The 100 Girlfriends Season 1
};

// Verified bridges for recent titles AniZip has not mapped to TheTVDB yet.
export const CUSTOM_TVDB_MAPPINGS: Record<number, number> = {
  184356: 452039, // Tomb Raider King
};
