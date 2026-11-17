// What a device is called in the device lists: its browser and operating system, read
// from what the browser says about itself. Only for recognising a device; nothing is
// ever allowed or refused by it.

export interface BrowserDescription {
  browser: string;
  os: string;
}

const UNKNOWN = "Unknown";

// Chromium browsers name themselves in the client hints; these brands say nothing.
const GENERIC_BRANDS = /^(Chromium|Not.A.Brand|Not\W*A\W*Brand)$/i;

const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Vivaldi\//, "Vivaldi"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/Windows/, "Windows"],
  [/Android/, "Android"],
  [/iPhone|iPad|iPod/, "iOS"],
  [/Macintosh|Mac OS X/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

export function describeBrowser(headers: Headers): BrowserDescription {
  const agent = headers.get("User-Agent") ?? "";
  return {
    browser: brandFromHints(headers.get("Sec-CH-UA")) ?? first(BROWSERS, agent),
    os: unquote(headers.get("Sec-CH-UA-Platform")) || first(SYSTEMS, agent),
  };
}

/** The browser's own brand from `Sec-CH-UA`, e.g. "Brave" or "Google Chrome" (as "Chrome"). */
function brandFromHints(hints: string | null): string | null {
  if (!hints) return null;
  const brands = [...hints.matchAll(/"([^"]+)"\s*;\s*v=/g)].map((match) => match[1] as string);
  const brand = brands.find((name) => !GENERIC_BRANDS.test(name.trim()));
  if (!brand) return null;
  return brand.replace(/^(Google|Microsoft)\s+/, "");
}

function first(table: [RegExp, string][], agent: string): string {
  return table.find(([pattern]) => pattern.test(agent))?.[1] ?? UNKNOWN;
}

function unquote(value: string | null): string {
  const text = (value ?? "").replace(/^"|"$/g, "").trim();
  return text === "Unknown" ? "" : text;
}
