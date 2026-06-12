/**
 * VTT subtitle parsing and helpers for the custom subtitle renderer.
 */

export interface VttCue {
  id: string;
  startTime: number; // seconds
  endTime: number;   // seconds
  text: string;      // may contain VTT tags like <i>, <b>, <u>
  line?: number | "auto";
  position?: number;
  align?: "start" | "center" | "end";
}

/**
 * Parse a WebVTT string into an array of cues.
 * Handles WEBVTT header, NOTE blocks, STYLE blocks (discards them),
 * and standard cue blocks.
 */
export function parseVtt(vttText: string): VttCue[] {
  const cues: VttCue[] = [];
  const lines = vttText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  let i = 0;

  // Skip BOM
  if (lines[0] && lines[0].startsWith("\uFEFF")) {
    lines[0] = lines[0].slice(1);
  }

  // Skip WEBVTT header line
  if (lines[0] && lines[0].startsWith("WEBVTT")) {
    i = 1;
  }

  while (i < lines.length) {
    // Skip empty lines
    if (!lines[i] || lines[i].trim() === "") {
      i++;
      continue;
    }

    // Skip NOTE blocks
    if (lines[i].startsWith("NOTE")) {
      while (i < lines.length && lines[i].trim() !== "") {
        i++;
      }
      continue;
    }

    // Skip STYLE blocks
    if (lines[i].startsWith("STYLE")) {
      while (i < lines.length && lines[i].trim() !== "") {
        i++;
      }
      continue;
    }

    // Try to parse a cue
    const cue = parseCueBlock(lines, i);
    if (cue) {
      cues.push(cue.cue);
      i = cue.nextIndex;
    } else {
      i++;
    }
  }

  return cues;
}

function parseCueBlock(
  lines: string[],
  startIndex: number,
): { cue: VttCue; nextIndex: number } | null {
  let i = startIndex;
  let id = "";

  // Check if this line is a cue ID (no --> in it)
  if (i < lines.length && !lines[i].includes("-->")) {
    id = lines[i].trim();
    i++;
  }

  // This line must be a timing line
  if (i >= lines.length || !lines[i].includes("-->")) {
    return null;
  }

  const timingLine = lines[i];
  i++;

  const timing = parseTimingLine(timingLine);
  if (!timing) return null;

  // Collect text lines until empty line or end
  const textLines: string[] = [];
  while (i < lines.length && lines[i].trim() !== "") {
    textLines.push(lines[i]);
    i++;
  }

  if (textLines.length === 0) return null;

  return {
    cue: {
      id: id || `cue-${timing.start}-${timing.end}`,
      startTime: timing.start,
      endTime: timing.end,
      text: textLines.join("\n"),
      line: timing.line,
      position: timing.position,
      align: timing.align,
    },
    nextIndex: i,
  };
}

function parseTimingLine(line: string): {
  start: number;
  end: number;
  line?: number | "auto";
  position?: number;
  align?: "start" | "center" | "end";
} | null {
  const parts = line.split("-->");
  if (parts.length !== 2) return null;

  const start = parseTimestamp(parts[0].trim());
  // The end part may have settings after the timestamp
  const endParts = parts[1].trim().split(/\s+/);
  const end = parseTimestamp(endParts[0]);

  if (start === null || end === null) return null;

  // Parse optional settings
  let lineVal: number | "auto" | undefined;
  let positionVal: number | undefined;
  let alignVal: "start" | "center" | "end" | undefined;

  for (let i = 1; i < endParts.length; i++) {
    const setting = endParts[i];
    if (setting.startsWith("line:")) {
      const v = setting.slice(5);
      lineVal = v === "auto" ? "auto" : parseFloat(v);
    } else if (setting.startsWith("position:")) {
      positionVal = parseFloat(setting.slice(9));
    } else if (setting.startsWith("align:")) {
      const v = setting.slice(6);
      if (v === "start" || v === "center" || v === "end") {
        alignVal = v;
      }
    }
  }

  return { start, end, line: lineVal, position: positionVal, align: alignVal };
}

function parseTimestamp(ts: string): number | null {
  // Supports HH:MM:SS.mmm and MM:SS.mmm
  const match = ts.match(
    /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/,
  );
  if (!match) return null;

  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const ms = match[4] ? parseInt(match[4].padEnd(3, "0"), 10) : 0;

  return hours * 3600 + minutes * 60 + seconds + ms / 1000;
}

/**
 * Fetch and parse a VTT subtitle file from a URL.
 * Handles CORS-proxied URLs from our backend.
 */
export async function fetchAndParseVtt(url: string): Promise<VttCue[]> {
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const text = await response.text();
    return parseVtt(text);
  } catch {
    return [];
  }
}

/**
 * Find active cues at a given playback time.
 */
export function getActiveCues(cues: VttCue[], time: number): VttCue[] {
  return cues.filter((cue) => time >= cue.startTime && time < cue.endTime);
}

/**
 * Strip VTT formatting tags from text for plain display.
 */
export function stripVttTags(text: string): string {
  return text.replace(/<[^>]+>/g, "");
}

/**
 * Convert basic SRT to VTT format.
 */
export function srtToVtt(srt: string): string {
  let vtt = "WEBVTT\n\n";
  // Replace comma in timestamps with period
  vtt += srt
    .replace(/\r\n/g, "\n")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
    // Remove sequence numbers (lines that are just digits before timing lines)
    .replace(/^\d+\n(?=\d{2}:\d{2}:\d{2})/gm, "");
  return vtt;
}
