// What this tab hears of the shares it watches. Every watched share with screen audio
// plays at once, mixed, with nothing turned down by itself: each has its own volume and
// mute, and "hear only this one" mutes the others.
//
// The volume belongs to the member and is kept on this device, so a loud friend stays
// turned down the next time they are watched. Mute belongs to one watch of one share and
// is never kept: a share watched again, or after a reload, is heard.

import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { readStored, writeStored } from "./stored.js";

/** A member's volume when none is kept on this device: full. */
const FULL = 100;

const key = (member: string) => `graeae:volume:${member}`;

/** A kept volume as the whole percentage it was saved as, or full when it is missing or not one. */
function kept(member: string): number {
  const stored = readStored(key(member));
  const value = stored === null ? NaN : Number(stored);
  return Number.isInteger(value) && value >= 0 && value <= FULL ? value : FULL;
}

/**
 * How loud a share plays at a volume of `percent`, as the media element's volume. The
 * control moves in even steps of loudness, which the ear hears roughly as the square of
 * the element's linear volume, so its lower half stays usable.
 */
export function gain(percent: number): number {
  return (percent / FULL) ** 2;
}

export class Hearing {
  /** Each member's volume this visit, read from the device on first use. */
  private readonly volumes = new SvelteMap<string, number>();
  /** The watched shares, by their stage key, that this tab has muted. */
  private readonly muted = new SvelteSet<string>();

  /** The volume this tab plays `member`'s screen audio at, from 0 to 100. */
  volume(member: string): number {
    return this.volumes.get(member) ?? kept(member);
  }

  /** Sets `member`'s volume and keeps it on this device. Turning a muted share's volume unmutes it. */
  setVolume(member: string, share: string, percent: number) {
    const value = Math.round(Math.min(FULL, Math.max(0, percent)));
    this.volumes.set(member, value);
    writeStored(key(member), String(value));
    this.muted.delete(share);
  }

  isMuted(share: string): boolean {
    return this.muted.has(share);
  }

  setMuted(share: string, muted: boolean) {
    if (muted) this.muted.add(share);
    else this.muted.delete(share);
  }

  /** Whether `share` is the one heard among `sounding`, the watched shares with sound. */
  isOnly(share: string, sounding: readonly string[]): boolean {
    return sounding.length > 1 && !this.muted.has(share) && sounding.every((other) => other === share || this.muted.has(other));
  }

  /**
   * Hears only `share` among `sounding`, the watched shares with sound: it is unmuted and
   * the others muted. When it already is the only one heard, every share is heard again.
   */
  hearOnly(share: string, sounding: readonly string[]) {
    const again = this.isOnly(share, sounding);
    for (const other of sounding) this.setMuted(other, again ? false : other !== share);
  }

  /** Forgets the mute of every share no longer on the stage, so a share watched again is heard. */
  keep(stage: readonly string[]) {
    for (const share of [...this.muted]) if (!stage.includes(share)) this.muted.delete(share);
  }
}
