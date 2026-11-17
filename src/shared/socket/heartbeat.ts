// The heartbeat, which both kinds of signaling connection share: the room's and the list
// of rooms'. A tab sends one every 5 seconds whatever its member is doing; there is no
// idle detection. The instance answers each one, so a tab can tell a dead connection
// from a quiet room.
//
// A connection that is lost (it fails, or falls silent) is not a leave. Its tab keeps its
// member present for a grace period counted from the last heartbeat heard, while the
// browser reconnects by itself. After a shorter silence the room's other tabs see a
// "reconnecting" mark on that member, if none of their tabs in the room is still heard.

/** How often a tab sends a heartbeat. */
export const HEARTBEAT_EVERY_MS = 5_000;

/** The silence after which a member with no tab left heard in a room is marked "reconnecting". */
export const RECONNECTING_AFTER_MS = 10_000;

/** How long a tab whose connection is lost keeps its presence, from its last heartbeat heard. */
export const GRACE_MS = 30_000;

/**
 * The close code a tab sends when it gives up on a connection that seems dead and opens
 * another. The instance treats it as a lost connection, not a leave.
 */
export const LOST_CLOSE_CODE = 4000;

/** The close code of a socket the instance closed because its grace period ran out. */
export const SILENT_CLOSE_CODE = 4408;

/** A tab's heartbeat, and the instance's answer to it. */
export type Heartbeat = { type: "heartbeat" };
export type Heard = { type: "heard" };

export const HEARTBEAT: { beat: Heartbeat; answer: Heard } = {
  beat: { type: "heartbeat" },
  answer: { type: "heard" },
};
