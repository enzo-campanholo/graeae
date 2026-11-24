// The watching area: what this tab watches, and who watches your own shares.
//
// Watching is chosen per share, and belongs to the tab's device: each tab has its own
// stage, and nothing is on it when the tab opens. A tab asks to watch a share by its
// sharer and kind, never by anything of the media server's (ADR 0003). The instance
// pulls the share to the tab's receiving connection, and its half of that negotiation comes
// in the media area as `pulled`, before `watched` puts the share on the stage. A refusal
// comes in the media area too, as `pull-refused`.
//
// A share that goes out at two qualities is watched at "Auto" until the tab chooses
// otherwise; the instance sets the preferred quality on the media server mid-watch.
//
// `watched`, `unwatched` and `quality` go to the one tab they concern. `watchers` goes
// only to the sharer's own tabs on the room: nobody else learns who is watching what.

import { unknownChange } from "./area.ts";
import type { LiveShare } from "./shares.ts";

/**
 * The quality a viewer chooses to watch a two-quality share at. "Auto" is 1080p, stepped
 * down to 720p by the media server for this viewer alone when their link is weak.
 */
export type QualityChoice = "auto" | "1080p" | "720p";

/** The members watching one of your own live shares. */
export interface Watchers {
  share: LiveShare;
  /** Member ids, each once however many devices they watch on. Never yours. */
  members: string[];
}

/** A quality this tab chose for a share it watches, other than "Auto". */
export interface ChosenQuality {
  share: LiveShare;
  quality: Exclude<QualityChoice, "auto">;
}

export interface WatchingState {
  /** The shares this tab watches, in the order it began watching them. */
  stage: LiveShare[];
  /** Who watches each of your own live shares in this room. A share nobody watches is not listed. */
  watchers: Watchers[];
  /** The shares on this tab's stage it watches at a quality other than "Auto". */
  qualities: ChosenQuality[];
}

export type WatchingChange =
  /** This tab now watches `share`: it is on the tab's stage, at "Auto". */
  | { type: "watched"; share: LiveShare }
  /** This tab no longer watches `share`: the pull is closed at the media server. */
  | { type: "unwatched"; share: LiveShare }
  /** Who watches one of your own shares now. No members: nobody does, or the share ended. */
  | { type: "watchers"; share: LiveShare; members: string[] }
  /**
   * The quality this tab watches `share` at, in answer to its choice: the one it chose,
   * or the one it had when the choice could not be made. A share with one quality is
   * always "Auto".
   */
  | { type: "quality"; share: LiveShare; quality: QualityChoice };

export type WatchingRequest =
  /**
   * Watch `share` on this tab, over the tab's receiving connection (the tab connects
   * first). The share must be live in the room this tab is showing.
   */
  | { type: "watch"; share: LiveShare }
  /** Stop watching `share` on this tab. */
  | { type: "unwatch"; share: LiveShare }
  /** Watch `share`, which this tab watches, at `quality`. The instance answers with `quality`. */
  | { type: "quality"; share: LiveShare; quality: QualityChoice };

export function applyWatching(state: WatchingState, change: WatchingChange): WatchingState {
  switch (change.type) {
    case "watched":
      return {
        ...state,
        stage: [...state.stage.filter((share) => !sameShare(share, change.share)), change.share],
        qualities: withoutShare(state.qualities, change.share),
      };
    case "unwatched":
      return {
        ...state,
        stage: state.stage.filter((share) => !sameShare(share, change.share)),
        qualities: withoutShare(state.qualities, change.share),
      };
    case "watchers": {
      const others = state.watchers.filter((entry) => !sameShare(entry.share, change.share));
      if (change.members.length === 0) return { ...state, watchers: others };
      const entry = { share: change.share, members: change.members };
      const at = state.watchers.findIndex((existing) => sameShare(existing.share, change.share));
      return { ...state, watchers: at < 0 ? [...others, entry] : state.watchers.with(at, entry) };
    }
    case "quality": {
      const others = withoutShare(state.qualities, change.share);
      const { quality, share } = change;
      return { ...state, qualities: quality === "auto" ? others : [...others, { share, quality }] };
    }
    default:
      return unknownChange(state, change);
  }
}

/** Whether `value` is a quality a viewer can choose. */
export function isQualityChoice(value: unknown): value is QualityChoice {
  return value === "auto" || value === "1080p" || value === "720p";
}

/** The quality this tab watches `share` at, as `state` says. */
export function qualityOf(state: WatchingState, share: LiveShare): QualityChoice {
  return state.qualities.find((chosen) => sameShare(chosen.share, share))?.quality ?? "auto";
}

/** Whether two live shares are the same one: a member has one share of each kind at most. */
export function sameShare(a: LiveShare, b: LiveShare): boolean {
  return a.member === b.member && a.kind === b.kind;
}

function withoutShare(qualities: ChosenQuality[], share: LiveShare): ChosenQuality[] {
  return qualities.filter((chosen) => !sameShare(chosen.share, share));
}
