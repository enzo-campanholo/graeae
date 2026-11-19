// What the removal confirm says before a member loses a room or leaves graeae: where
// they are now, which of their shares end for the people watching, and what they keep.
// People asks it from a member's side and Rooms from a room's, in the same words.

import type { MemberEntry, RoomSummary } from "../../../shared/api.ts";
import { andList } from "$lib/words.js";

export interface Removal {
  title: string;
  lines: string[];
}

/** A room's name, from its address. */
export function roomName(rooms: readonly RoomSummary[], address: string): string {
  return rooms.find((room) => room.address === address)?.name ?? "a room";
}

/** The confirm for taking the room at `address` away from `person`. */
export function removalFromRoom(person: MemberEntry, address: string, rooms: readonly RoomSummary[]): Removal {
  const name = person.name;
  const room = roomName(rooms, address);
  const keeps = person.rooms.filter((other) => other !== address).map((other) => roomName(rooms, other));
  return {
    title: `Remove ${name} from ${room}?`,
    lines: [
      ...(person.present.includes(address)
        ? [
            `${name} is in ${room} now. Their page there becomes “nothing here” within about 2 seconds.`,
            sharingLine(person, rooms, address),
          ]
        : [`${name} is not in ${room} now.`]),
      keeps.length > 0
        ? `They keep ${andList(keeps)}.`
        : `${room} is their only room. They stay a member with no room until you tick one.`,
    ],
  };
}

/** The confirm for removing `person` from graeae. */
export function removalFromInstance(person: MemberEntry, rooms: readonly RoomSummary[]): Removal {
  const name = person.name;
  const named = (addresses: readonly string[]) => andList(addresses.map((address) => roomName(rooms, address)));
  const devices = person.devices.length;
  const forgotten =
    devices === 0
      ? "They have no device left to forget."
      : devices === 1
        ? "Their device is forgotten."
        : `Their ${devices} devices are forgotten.`;
  return {
    title: `Remove ${name} from graeae?`,
    lines: [
      ...(person.present.length > 0
        ? [
            `${name} is present in ${named(person.present)}. Every page of theirs becomes “nothing here” within about 2 seconds.`,
            sharingLine(person, rooms),
          ]
        : [`${name} is not in any room now.`]),
      person.rooms.length > 0 ? `They lose ${named(person.rooms)} and keep no room.` : "They have no room to lose.",
      `${forgotten} Coming back takes a new invite.`,
    ],
  };
}

/**
 * What a removal ends of a present member's shares: in the room at `address`, or in
 * every room without it. Shares end for their viewers too, so the owner hears that
 * before the press.
 */
function sharingLine(person: MemberEntry, rooms: readonly RoomSummary[], address?: string): string {
  const shares = person.sharing.filter((share) => address === undefined || share.room === address);
  if (shares.length === 0) return address === undefined ? "They share nothing now." : "They share nothing there now.";
  // Grouped by room, so two shares in one room read "screen and webcam shares in First room".
  const sharesPhrase = (list: typeof shares) =>
    `${andList(list.map((share) => share.kind))} ${list.length > 1 ? "shares" : "share"}`;
  const items =
    address === undefined
      ? [...new Set(shares.map((share) => share.room))].map(
          (room) => `${sharesPhrase(shares.filter((share) => share.room === room))} in ${roomName(rooms, room)}`,
        )
      : [`${sharesPhrase(shares)} there`];
  const ends = shares.length > 1 ? "end" : "ends";
  return `Their ${andList(items)} ${ends} for everyone watching.`;
}
