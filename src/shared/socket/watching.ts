// The watching area: what this tab watches, and who watches your own shares.
//
// Watching is chosen per share, and belongs to the tab's device: each tab has its own
// stage, and nothing is on it when the tab opens. A tab asks to watch a share by its
// sharer and kind, never by anything of the media server's (ADR 0003). The instance
// pulls the share to the tab's media connection, and its half of that negotiation comes
// in the media area as `pulled`, before `watched` puts the share on the stage. A refusal
// comes in the media area too, as `pull-refused`.
//
// `watched` and `unwatched` go to the one tab they concern. `watchers` goes only to the
// sharer's own tabs on the room: nobody else learns who is watching what.

import { unknownChange } from "./area.ts";
import type { LiveShare } from "./shares.ts";

/** The members watching one of your own live shares. */
export interface Watchers {
  share: LiveShare;
  /** Member ids, each once however many devices they watch on. Never yours. */
  members: string[];
}

export interface WatchingState {
  /** The shares this tab watches, in the order it began watching them. */
  stage: LiveShare[];
  /** Who watches each of your own live shares in this room. A share nobody watches is not listed. */
  watchers: Watchers[];
}

export type WatchingChange =
  /** This tab now watches `share`: it is on the tab's stage. */
  | { type: "watched"; share: LiveShare }
  /** This tab no longer watches `share`: the pull is closed at the media server. */
  | { type: "unwatched"; share: LiveShare }
  /** Who watches one of your own shares now. No members: nobody does, or the share ended. */
  | { type: "watchers"; share: LiveShare; members: string[] };

export type WatchingRequest =
  /**
   * Watch `share` on this tab, over the tab's media connection (the tab connects
   * first). The share must be live in the room this tab is showing.
   */
  | { type: "watch"; share: LiveShare }
  /** Stop watching `share` on this tab. */
  | { type: "unwatch"; share: LiveShare };

export function applyWatching(state: WatchingState, change: WatchingChange): WatchingState {
  switch (change.type) {
    case "watched":
      return { ...state, stage: [...state.stage.filter((share) => !sameShare(share, change.share)), change.share] };
    case "unwatched":
      return { ...state, stage: state.stage.filter((share) => !sameShare(share, change.share)) };
    case "watchers": {
      const others = state.watchers.filter((entry) => !sameShare(entry.share, change.share));
      if (change.members.length === 0) return { ...state, watchers: others };
      const entry = { share: change.share, members: change.members };
      const at = state.watchers.findIndex((existing) => sameShare(existing.share, change.share));
      return { ...state, watchers: at < 0 ? [...others, entry] : state.watchers.with(at, entry) };
    }
    default:
      return unknownChange(state, change);
  }
}

/** Whether two live shares are the same one: a member has one share of each kind at most. */
export function sameShare(a: LiveShare, b: LiveShare): boolean {
  return a.member === b.member && a.kind === b.kind;
}
