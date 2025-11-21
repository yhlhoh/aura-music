import { LyricLine, LyricWord } from "../types";

// Declare global for the script loaded in index.html
declare const jsmediatags: any;
declare const ColorThief: any;

export const formatTime = (seconds: number): string => {
  if (isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export const shuffleArray = <T>(array: T[]): T[] => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

// Helper to request via CORS proxy (api.allorigins.win is reliable for GET requests)
// 先尝试直接请求，跨域失败时再使用代理
export const fetchViaProxy = async (targetUrl: string): Promise<any> => {
  let text: string;

  // 1. 先尝试直接请求
  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(
        `Direct fetch failed with status: ${response.status} ${targetUrl}`,
      );
    }
    text = await response.text();
    return JSON.parse(text);
  } catch (directError) {
    // 2. 直接请求失败（可能是 CORS 错误），使用代理
    console.warn(
      "Direct fetch failed (likely CORS), trying proxy:",
      directError,
    );

    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`Proxy fetch failed with status: ${response.status}`);
      }
      text = await response.text();
      return JSON.parse(text);
    } catch (proxyError) {
      console.error(
        "Both direct and proxy requests failed:",
        proxyError,
        targetUrl,
      );
      throw proxyError;
    }
  }
};

export const parseNeteaseLink = (
  input: string,
): { type: "song" | "playlist"; id: string } | null => {
  try {
    const url = new URL(input);
    const params = new URLSearchParams(url.search);
    // Handle music.163.com/#/song?id=... (Hash router)
    if (url.hash.includes("/song") || url.hash.includes("/playlist")) {
      const hashParts = url.hash.split("?");
      if (hashParts.length > 1) {
        const hashParams = new URLSearchParams(hashParts[1]);
        const id = hashParams.get("id");
        if (id) {
          if (url.hash.includes("/song")) return { type: "song", id };
          if (url.hash.includes("/playlist")) return { type: "playlist", id };
        }
      }
    }
    // Handle standard params
    const id = params.get("id");
    if (id) {
      if (url.pathname.includes("song")) return { type: "song", id };
      if (url.pathname.includes("playlist")) return { type: "playlist", id };
    }
    return null;
  } catch (e) {
    return null;
  }
};

export const parseTimeTag = (timeStr: string): number => {
  const match = timeStr.match(/(\d{2}):(\d{2})\.(\d{2,3})/);
  if (!match) return 0;
  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  const msStr = match[3];
  const ms = parseInt(msStr, 10);
  // .xx is 10ms units, .xxx is 1ms units
  const msValue = msStr.length === 3 ? ms / 1000 : ms / 100;
  return minutes * 60 + seconds + msValue;
};

interface ParsedLineData {
  time: number;
  text: string;
  words: LyricWord[];
  tagCount: number;
  originalIndex: number; // Added for stable sort
  isMetadata?: boolean;
}

const metadataIndicators = [
  "歌词贡献者",
  "翻译贡献者",
  "作词",
  "作曲",
  "编曲",
  "制作",
  "词曲",
];

const isMetadataLine = (text: string): boolean => {
  if (!text) return false;
  const normalized = text.replace(/\s+/g, "");
  return metadataIndicators.some((indicator) =>
    normalized.toLowerCase().includes(indicator.toLowerCase()),
  );
};

const getEntryDisplayText = (entry: ParsedLineData): string => {
  if (entry.text && entry.text.trim().length > 0) {
    return entry.text.trim();
  }
  if (entry.words && entry.words.length > 0) {
    return entry.words
      .map((w) => w.text)
      .join("")
      .trim();
  }
  return "";
};

const hasMeaningfulContent = (entry: ParsedLineData): boolean => {
  return getEntryDisplayText(entry).length > 0;
};

const LRC_LINE_REGEX = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
const YRC_LINE_REGEX = /^\[(\d+),(\d+)\](.*)/;
const YRC_WORD_REGEX = /\((\d+),(\d+),(\d+)\)([^\(]*)/g;

// Helper to parse a single line content into text and words (Standard LRC Enhanced)
const parseLineContent = (
  startTime: number,
  cleanContent: string,
): { text: string; words: LyricWord[]; tagCount: number } => {
  // Regex to find <mm:ss.xx>TAG or <time>TAG
  const tagRegex = /<(\d{2}):(\d{2})\.(\d{2,3})>([^<]*)/g;

  const words: LyricWord[] = [];
  let tagCount = 0;

  const matches = [...cleanContent.matchAll(tagRegex)];

  if (matches.length > 0) {
    tagCount = matches.length;
    matches.forEach((m, i) => {
      const wTime = parseTimeTag(`${m[1]}:${m[2]}.${m[3]}`);
      const wText = m[4];

      if (true) {
        let endTime = 0;
        if (i < matches.length - 1) {
          const nextM = matches[i + 1];
          endTime = parseTimeTag(`${nextM[1]}:${nextM[2]}.${nextM[3]}`);
        } else {
          endTime = wTime + 1.0;
        }

        if (wText) {
          words.push({
            text: wText,
            startTime: wTime,
            endTime: endTime,
          });
        }
      }
    });
  }

  const fullText = cleanContent.replace(/<[^>]+>/g, "").trim();

  return { text: fullText, words, tagCount };
};

const parseSingleLrc = (lrcContent: string): LyricLine[] => {
  const lines = lrcContent.split("\n");
  const rawEntries: ParsedLineData[] = [];

  // 1. First pass: extract all timestamped lines
  lines.forEach((line, index) => {
    line = line.trim();
    if (!line) return;

    // Special Handling for Netease JSON Metadata lines
    // Example: {"t":0,"c":[{"tx":"作词: "},{"tx":"辻 純更"}]}
    if (line.startsWith("{") && line.endsWith("}")) {
      try {
        const json = JSON.parse(line);
        if (json.c && Array.isArray(json.c)) {
          const text = json.c.map((item: any) => item.tx).join("");
          const time = (json.t || 0) / 1000;
          rawEntries.push({
            time,
            text,
            words: [],
            tagCount: 0, // Low priority, treat as standard line
            originalIndex: index,
            isMetadata: isMetadataLine(text),
          });
          return;
        }
      } catch (e) {
        // Not valid JSON, continue
      }
    }

    // Check YRC format first
    const yrcMatch = line.match(YRC_LINE_REGEX);
    if (yrcMatch) {
      const startTimeMs = parseInt(yrcMatch[1], 10);
      const content = yrcMatch[3];

      const words: LyricWord[] = [];
      let fullText = "";

      const matches = [...content.matchAll(YRC_WORD_REGEX)];
      if (matches.length > 0) {
        matches.forEach((m) => {
          const wStart = parseInt(m[1], 10) / 1000;
          const wDur = parseInt(m[2], 10) / 1000;
          const wText = m[4];
          fullText += wText;

          words.push({
            text: wText,
            startTime: wStart,
            endTime: wStart + wDur,
          });
        });
      } else {
        fullText = content;
      }

      rawEntries.push({
        time: startTimeMs / 1000,
        text: fullText,
        words: words,
        tagCount: words.length + 1000, // High priority for YRC
        originalIndex: index,
        isMetadata: isMetadataLine(fullText),
      });
      return;
    }

    // Check Standard LRC format
    const lrcMatch = line.match(LRC_LINE_REGEX);
    if (lrcMatch) {
      const time = parseTimeTag(`${lrcMatch[1]}:${lrcMatch[2]}.${lrcMatch[3]}`);
      const content = lrcMatch[4].trim();

      const parsed = parseLineContent(time, content);

      rawEntries.push({
        time,
        text: parsed.text,
        words: parsed.words,
        tagCount: parsed.tagCount,
        originalIndex: index,
        isMetadata: isMetadataLine(parsed.text),
      });
      return;
    }
  });

  // 2. Sort by time, using originalIndex for stability
  rawEntries.sort((a, b) => {
    const diff = a.time - b.time;
    if (Math.abs(diff) > 0.01) return diff;
    return a.originalIndex - b.originalIndex;
  });

  const result: LyricLine[] = [];
  const hasYrc = rawEntries.some((e) => e.tagCount >= 1000);

  if (hasYrc) {
    // Enhanced Grouping for YRC + Translation (Netease style)
    const yrcLines = rawEntries.filter((e) => e.tagCount >= 1000);
    const otherLines = rawEntries.filter((e) => e.tagCount < 1000);

    // Create buckets for each main YRC line
    const buckets = yrcLines.map((yrc) => ({
      main: yrc,
      translations: [] as string[],
    }));

    const orphans: ParsedLineData[] = [];

    // Assign translation lines to the closest YRC line within a threshold
    otherLines.forEach((line) => {
      let closestIndex = -1;
      let minDiff = Infinity;

      buckets.forEach((bucket, idx) => {
        const diff = Math.abs(bucket.main.time - line.time);
        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = idx;
        }
      });

      // Tolerance: 3.0s. Relaxed to accommodate larger drifts in Netease data.
      if (closestIndex !== -1 && minDiff < 3.0 && !line.isMetadata) {
        const translationText = getEntryDisplayText(line);
        if (translationText.length > 0) {
          buckets[closestIndex].translations.push(translationText);
          return;
        }
      }
      orphans.push(line);
    });

    // Convert buckets to result
    buckets.forEach((b) => {
      const mainText = getEntryDisplayText(b.main);
      const normalizedMain = mainText.toLowerCase();
      const translations = b.translations
        .map((t) => t.trim())
        .filter(
          (t) =>
            t.length > 0 &&
            (!normalizedMain || t.toLowerCase() !== normalizedMain),
        );
      result.push({
        time: b.main.time,
        text: mainText || b.main.text,
        words:
          b.main.words && b.main.words.length > 0 ? b.main.words : undefined,
        translation:
          translations.length > 0 ? translations.join("\n") : undefined,
        isPreciseTiming: true,
      });
    });

    // Append orphans (e.g. metadata lines or unmatched lines)
    orphans.forEach((o) => {
      const orphanText = getEntryDisplayText(o);
      result.push({
        time: o.time,
        text: orphanText || o.text,
        words: o.words && o.words.length > 0 ? o.words : undefined,
        isPreciseTiming: false,
      });
    });

    // Re-sort the final result to ensure correct order
    result.sort((a, b) => a.time - b.time);
  } else {
    // 3. Group lines with same time (Standard LRC logic)
    let i = 0;
    while (i < rawEntries.length) {
      const current = rawEntries[i];
      const group = [current];
      let j = i + 1;

      // Strict grouping (0.1s) for standard LRC where lines should be aligned
      while (
        j < rawEntries.length &&
        Math.abs(rawEntries[j].time - current.time) < 0.1
      ) {
        group.push(rawEntries[j]);
        j++;
      }

      // Sort group: Enhanced lyrics/YRC (high tag count) first, then original index
      group.sort((a, b) => {
        if (a.tagCount !== b.tagCount) return b.tagCount - a.tagCount;
        return a.originalIndex - b.originalIndex;
      });

      const main =
        group.find(
          (entry) => !entry.isMetadata && hasMeaningfulContent(entry),
        ) ??
        group.find((entry) => hasMeaningfulContent(entry)) ??
        group[0];

      const resolvedMainText = getEntryDisplayText(main) || main.text || "";
      const normalizedMain = resolvedMainText
        ? resolvedMainText.toLowerCase()
        : "";
      const translationParts = group
        .filter((entry) => entry !== main)
        .filter((entry) => !entry.isMetadata && hasMeaningfulContent(entry))
        .map((entry) => getEntryDisplayText(entry))
        .filter(
          (text) =>
            text.length > 0 &&
            (!normalizedMain || text.toLowerCase() !== normalizedMain),
        );
      const translation =
        translationParts.length > 0 ? translationParts.join("\n") : undefined;
      const isPrecise = main.tagCount >= 1000;

      result.push({
        time: main.time,
        text: resolvedMainText,
        words: main.words && main.words.length > 0 ? main.words : undefined,
        translation,
        isPreciseTiming: isPrecise,
      });

      i = j;
    }
  }

  // 4. Fix word end times (Only for lines without explicit word timing)
  for (let k = 0; k < result.length; k++) {
    const line = result[k];

    // Skip auto-fixing if we have precise timing from YRC
    if (line.isPreciseTiming) continue;

    const nextLineTime = result[k + 1]?.time ?? line.time + 5;

    if (line.words && line.words.length > 0) {
      for (let w = 0; w < line.words.length; w++) {
        if (w === line.words.length - 1) {
          const dur = nextLineTime - line.words[w].startTime;
          line.words[w].endTime = line.words[w].startTime + Math.min(dur, 5);
        }
      }
    }
  }

  return result;
};

const normalizeTimeKey = (time: number): number => {
  return Math.round(time * 100) / 100;
};

const buildTranslationMap = (
  translationContent?: string,
): Map<number, string[]> => {
  const map = new Map<number, string[]>();
  if (!translationContent) return map;

  const lines = translationContent.split("\n");
  const addEntry = (time: number, text: string) => {
    const cleaned = text.trim();
    if (!cleaned || isMetadataLine(cleaned)) return;
    const key = normalizeTimeKey(time);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(cleaned);
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    if (line.startsWith("{") && line.endsWith("}")) {
      try {
        const json = JSON.parse(line);
        if (json.c && Array.isArray(json.c)) {
          const text = json.c.map((item: any) => item.tx).join("");
          const time = (json.t || 0) / 1000;
          addEntry(time, text);
          return;
        }
      } catch {
        // ignore invalid JSON entries
      }
    }

    const yrcMatch = line.match(YRC_LINE_REGEX);
    if (yrcMatch) {
      const startTimeMs = parseInt(yrcMatch[1], 10);
      const content = yrcMatch[3];
      const matches = [...content.matchAll(YRC_WORD_REGEX)];
      let fullText = "";
      if (matches.length > 0) {
        fullText = matches.map((m) => m[4]).join("");
      } else {
        fullText = content;
      }
      addEntry(startTimeMs / 1000, fullText);
      return;
    }

    const lrcMatch = line.match(LRC_LINE_REGEX);
    if (lrcMatch) {
      const time = parseTimeTag(`${lrcMatch[1]}:${lrcMatch[2]}.${lrcMatch[3]}`);
      const text = lrcMatch[4].trim();
      addEntry(time, text);
    }
  });

  return map;
};

export const parseLrc = (
  lrcContent: string,
  translationContent?: string,
): LyricLine[] => {
  const baseLines = parseSingleLrc(lrcContent);
  const translationMap = buildTranslationMap(
    translationContent && translationContent.trim().length > 0
      ? translationContent
      : undefined,
  );

  const takeTranslationForLine = (line: LyricLine): string | undefined => {
    const key = normalizeTimeKey(line.time);
    const direct = translationMap.get(key);
    if (direct && direct.length > 0) {
      const value = direct.shift();
      if (direct.length === 0) {
        translationMap.delete(key);
      }
      return value;
    }

    let fallbackKey: number | null = null;
    let minDiff = Infinity;
    const tolerance = line.isPreciseTiming ? 3.0 : 0.25;

    translationMap.forEach((values, mapKey) => {
      if (values.length === 0) return;
      const diff = Math.abs(mapKey - key);
      if (diff <= tolerance && diff < minDiff) {
        minDiff = diff;
        fallbackKey = mapKey;
      }
    });

    if (fallbackKey !== null) {
      const list = translationMap.get(fallbackKey);
      if (list && list.length > 0) {
        const value = list.shift();
        if (list.length === 0) {
          translationMap.delete(fallbackKey);
        }
        return value;
      }
    }
    return undefined;
  };

  return baseLines.map((line) => {
    const external = takeTranslationForLine(line);
    const trimmedExternal = external?.trim();
    const finalTranslation =
      trimmedExternal && trimmedExternal.length > 0
        ? trimmedExternal
        : line.translation;

    if (finalTranslation === line.translation) {
      return line;
    }

    return {
      ...line,
      translation: finalTranslation,
    };
  });
};

export const mergeLyrics = (original: string, translation: string): string => {
  return original + "\n" + translation;
};

// Metadata Parser using jsmediatags
export const parseAudioMetadata = (
  file: File,
): Promise<{
  title?: string;
  artist?: string;
  picture?: string;
  lyrics?: string;
}> => {
  return new Promise((resolve) => {
    if (typeof jsmediatags === "undefined") {
      console.warn("jsmediatags not loaded");
      resolve({});
      return;
    }

    try {
      jsmediatags.read(file, {
        onSuccess: (tag: any) => {
          try {
            const tags = tag.tags;
            let pictureUrl = undefined;
            let lyricsText = undefined;

            if (tags.picture) {
              const { data, format } = tags.picture;
              let base64String = "";
              const len = data.length;
              for (let i = 0; i < len; i++) {
                base64String += String.fromCharCode(data[i]);
              }
              pictureUrl = `data:${format};base64,${window.btoa(base64String)}`;
            }

            // Extract embedded lyrics (USLT tag for unsynchronized lyrics)
            // Some formats also use "lyrics" or "LYRICS" tag
            if (tags.USLT) {
              // USLT can be an object with lyrics.text or just a string
              lyricsText =
                typeof tags.USLT === "object"
                  ? tags.USLT.lyrics || tags.USLT.text
                  : tags.USLT;
            } else if (tags.lyrics) {
              lyricsText = tags.lyrics;
            } else if (tags.LYRICS) {
              lyricsText = tags.LYRICS;
            }

            resolve({
              title: tags.title,
              artist: tags.artist,
              picture: pictureUrl,
              lyrics: lyricsText,
            });
          } catch (innerErr) {
            console.error("Error parsing tags structure:", innerErr);
            resolve({});
          }
        },
        onError: (error: any) => {
          console.warn("Error reading tags:", error);
          resolve({});
        },
      });
    } catch (err) {
      console.error("jsmediatags crashed:", err);
      resolve({});
    }
  });
};

export const extractColors = async (imageSrc: string): Promise<string[]> => {
  // Keep colors vibrant but avoid too-bright picks that would hide white lyrics.
  const capBrightness = (rgb: number[]): number[] => {
    const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    const maxLum = 230; // Empirically keep enough contrast against white text
    if (lum <= maxLum) return rgb;
    const factor = maxLum / lum;
    return [
      Math.round(rgb[0] * factor),
      Math.round(rgb[1] * factor),
      Math.round(rgb[2] * factor),
    ];
  };

  return new Promise((resolve) => {
    if (typeof ColorThief === 'undefined') {
      console.warn("ColorThief not loaded");
      resolve(['#4f46e5', '#db2777', '#1f2937']);
      return;
    }

    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = imageSrc;

    img.onload = () => {
      try {
        const colorThief = new ColorThief();
        // 1. Get a palette of 5 colors
        const palette = colorThief.getPalette(img, 5);

        if (!palette || palette.length === 0) {
          resolve([]);
          return;
        }

        // 2. Filter out near-black/dark colors
        // Luminance: 0.2126 R + 0.7152 G + 0.0722 B
        const vibrantCandidates = palette.filter((rgb: number[]) => {
          const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
          // Threshold: remove colors darker than ~30/255 luminance
          return lum > 30;
        });

        // If we filtered everything out (very dark album), fall back to original palette
        const candidates = vibrantCandidates.length > 0 ? vibrantCandidates : palette;

        // 3. Sort by "Vibrancy" (approx Saturation: Max - Min channel value)
        candidates.sort((a: number[], b: number[]) => {
          const satA = Math.max(...a) - Math.min(...a);
          const satB = Math.max(...b) - Math.min(...b);
          return satB - satA; // Descending saturation
        });

        // 4. Take Top 3
        const topColors = candidates.slice(0, 3);

        const colorStrings = topColors.map((c: number[]) => {
          const adjusted = capBrightness(c);
          return `rgb(${adjusted[0]}, ${adjusted[1]}, ${adjusted[2]})`;
        });
        resolve(colorStrings);
      } catch (e) {
        console.warn("Color extraction failed", e);
        resolve([]);
      }
    };

    img.onerror = () => {
      resolve([]);
    };
  });
};
