import type { ShowcaseTitle } from "@/lib/access/showcase";

const COLUMNS = 10;

/**
 * Tilted wall of trending posters, slowly drifting, behind the invite and welcome pages.
 * Pure CSS animation (see .poster-column-* in globals.css), so it costs no JavaScript.
 */
export default function PosterWall({ titles, dim = 0.5 }: { titles: ShowcaseTitle[]; dim?: number }) {
  if (titles.length === 0) return null;
  const columns = Array.from({ length: COLUMNS }, (_, c) => {
    // Each column starts at a different point in the list so neighbours never match.
    const list = Array.from({ length: 7 }, (_, i) => titles[(c * 3 + i * 2) % titles.length]);
    return [...list, ...list];
  });

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute left-1/2 top-1/2 flex w-[150vmax] -translate-x-1/2 -translate-y-1/2 -rotate-[9deg] gap-3 sm:gap-4"
        style={{ opacity: dim }}
      >
        {columns.map((column, c) => (
          <div key={c} className={`flex flex-1 flex-col gap-3 sm:gap-4 ${c % 2 ? "poster-column-down" : "poster-column-up"}`}>
            {column.map((title, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- decorative, many small covers; the optimizer would add a request per poster
              <img
                key={`${title.id}-${i}`}
                src={title.cover}
                alt=""
                loading={i < 7 ? "eager" : "lazy"}
                decoding="async"
                className="aspect-[2/3] w-full rounded-xl object-cover shadow-2xl shadow-black/60"
                style={{ backgroundColor: title.color ?? "#15161a" }}
              />
            ))}
          </div>
        ))}
      </div>
      {/* Keep the wall behind the content: darken the centre, fade every edge into the page. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(10,11,12,0.35)_0%,rgba(10,11,12,0.78)_60%,#0a0b0c_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#0a0b0c] to-transparent" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#0a0b0c] to-transparent" />
    </div>
  );
}
