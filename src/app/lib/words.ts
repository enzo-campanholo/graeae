// Small pieces of the app's language that more than one page uses.

/** A piece of a sentence about members: a display name, or the words between names. */
export interface Part {
  text: string;
  name: boolean;
}

/**
 * Who is watching one of your shares, in parts so the names can stand out:
 * "No one watching", "Bia watching", "Bia and Caio watching",
 * "Bia, Caio and Duda watching", "Bia, Caio and 2 others watching".
 */
export function watchersLine(names: readonly string[]): Part[] {
  if (names.length === 0) return [{ text: "No one watching", name: false }];
  const shown = names.length <= 3 ? names : names.slice(0, 2);
  const parts: Part[] = [];
  shown.forEach((name, i) => {
    if (i > 0) {
      const last = i === shown.length - 1 && names.length <= 3;
      parts.push({ text: last ? " and " : ", ", name: false });
    }
    parts.push({ text: name, name: true });
  });
  if (names.length > 3) parts.push({ text: ` and ${names.length - 2} others`, name: false });
  parts.push({ text: " watching", name: false });
  return parts;
}

/**
 * Gigabytes as the owner's meter shows them: whole from 10 up ("1,000 GB"), to a tenth
 * below, so the first evenings of a month do not read "0 GB" ("0.4 GB").
 */
export function gigabytes(value: number): string {
  const digits = value < 10 ? 1 : 0;
  return `${value.toLocaleString("en", { maximumFractionDigits: digits })} GB`;
}

/** A list of names as a sentence: "First room", "First room and Late shift", "A, B and C". */
export function andList(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * How long until a moment, as an invite's expiry is shown: "in 7 days", "in 36 hours",
 * "in 2 minutes", "in a minute". Rounded to the nearest unit, so an invite made just now
 * reads "in 7 days", and a larger unit is used once there are at least two of it.
 */
export function timeLeft(until: number, now: number): string {
  const left = until - now;
  const days = Math.round(left / 86_400_000);
  if (days >= 2) return `in ${days} days`;
  const hours = Math.round(left / 3_600_000);
  if (hours >= 2) return `in ${hours} hours`;
  const minutes = Math.round(left / 60_000);
  return minutes >= 2 ? `in ${minutes} minutes` : "in a minute";
}

/**
 * How long ago a moment was, as a device's last use is shown: "just now", "a minute ago",
 * "5 minutes ago", "3 hours ago", "2 days ago", "3 weeks ago", "4 months ago". Rounded to
 * the nearest unit, and a larger unit is used once there are at least two of it.
 */
export function timeAgo(at: number, now: number): string {
  const ago = Math.max(0, now - at);
  const days = Math.round(ago / 86_400_000);
  if (days >= 60) return `${Math.round(days / 30)} months ago`;
  if (days >= 14) return `${Math.round(days / 7)} weeks ago`;
  if (days >= 2) return `${days} days ago`;
  const hours = Math.round(ago / 3_600_000);
  if (hours >= 2) return `${hours} hours ago`;
  const minutes = Math.round(ago / 60_000);
  if (minutes >= 2) return `${minutes} minutes ago`;
  return minutes === 1 ? "a minute ago" : "just now";
}

/** A device as its member knows it: "Chrome on Windows", or less when the browser did not say. */
export function deviceLabel(browser: string, os: string): string {
  const known = (value: string) => value !== "" && value !== "Unknown";
  if (known(browser) && known(os)) return `${browser} on ${os}`;
  if (known(browser)) return browser;
  if (known(os)) return `A browser on ${os}`;
  return "A browser";
}

/** Dollars as the owner reads a cost, to the cent: "$0.00", "$50.00", "$1,250.50". */
export function dollars(value: number): string {
  return value.toLocaleString("en", { style: "currency", currency: "USD" });
}
