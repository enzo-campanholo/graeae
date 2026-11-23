// The log area: a tab's own record of what it did, sent to the instance in batches to be
// written to the instance's logs (ticket 48; the line itself is `src/shared/log.ts`). It
// holds no part of the room, changes nothing any tab sees, and is never answered.
//
// A tab with a signaling socket open, the room's or the list of rooms', sends its batches
// over it as `{ type: "log", request }`. The instance tags each event from the socket's
// own member, device, tab and room, whatever the event says. A page with no socket posts
// the same `LogRequest` to `LOG_PATH`, which the instance takes only from a remembered
// device: anyone else gets the one "nothing here" answer.

import type { LogLevel } from "../log.ts";

/** Where a page with no socket posts its batches. */
export const LOG_PATH = "/api/log";

/** The most events one batch holds; a longer batch is cut to this many. */
export const MAX_BATCH_EVENTS = 200;

/**
 * The most a batch may weigh, as JSON, before the instance takes none of it. graeae's own
 * bound, far under the 32 MiB a Durable Object's socket takes in a message; a tab's batch
 * of 200 events is a fraction of it.
 */
export const MAX_BATCH_BYTES = 1024 * 1024;

/** One event as a tab recorded it. */
export interface TabEvent {
  event: string;
  level?: LogLevel;
  /** The tab's own clock when it happened, in milliseconds since the epoch. */
  at: number;
  /** How long the page had been open, in milliseconds. */
  up: number;
  /** The page load it happened in. */
  page: string;
  [field: string]: unknown;
}

/** A batch of a tab's events, on its socket or posted. */
export type LogRequest = {
  type: "events";
  events: TabEvent[];
  /** How many events the tab dropped, the oldest first, since its last batch: its buffer was full. */
  dropped?: number;
};
