// The shapes of the instance's HTTP answers, shared by the instance and the page.

export interface RoomSummary {
  address: string;
  name: string;
}

/** Who the visiting device belongs to. Also the answer to `POST /api/me/name` with `{ name }`, the member renamed. */
export interface Me {
  name: string;
  owner: boolean;
}

/** `POST /api/setup`: where the owner's device goes next, and the other secrets the deploy left unset. */
export interface SetupAnswer {
  to: string;
  missing: string[];
}

/** `GET /api/rooms`: the rooms the member has access to, oldest first. */
export interface RoomsAnswer {
  rooms: RoomSummary[];
  me: Me;
}

/** `GET /api/rooms/<address>`. */
export interface RoomAnswer {
  room: RoomSummary;
  me: Me;
}

export interface DeviceSummary {
  id: string;
  browser: string;
  os: string;
  /** When the device last visited, in milliseconds since the epoch. */
  lastUsed: number;
  /** Whether it is the device asking. */
  current: boolean;
}

/** `GET /api/me`: the member, with their devices, most recently used first. */
export interface MeAnswer extends Me {
  devices: DeviceSummary[];
}

/** An owner's invite nobody has used or cancelled, and that has not expired. */
export interface PendingInvite {
  /** The invite's address is `/invite/<code>`. */
  code: string;
  /** The display name the invited person will have. */
  name: string;
  /** The rooms they will get access to, oldest first. */
  rooms: RoomSummary[];
  /** When it stops working, in milliseconds since the epoch. */
  expiresAt: number;
}

/** `GET /api/owner/invites`: the instance's rooms to choose from, and the pending invites, newest first. */
export interface InvitesAnswer {
  rooms: RoomSummary[];
  invites: PendingInvite[];
}

/** `POST /api/owner/invites` with `{ name, rooms? }`: the invite just made. */
export interface CreateInviteAnswer {
  invite: PendingInvite;
}

/** `GET /api/invites/<code>`: what the invite page shows before the press. */
export interface InviteAnswer {
  name: string;
}

/** `POST /api/invites/<code>`: the press. Where the new member goes next. */
export interface JoinAnswer {
  to: string;
}

/** `POST /api/owner/rooms` with `{ name }`: the room just made. */
export interface CreateRoomAnswer {
  room: RoomSummary;
}

/** A member's "Add a device" invite: one browser, once, within 10 minutes. */
export interface DeviceInvite {
  /** The invite's address is `/invite/<code>`, the same page as an owner's invite. */
  code: string;
  /** When it stops working, in milliseconds since the epoch. */
  expiresAt: number;
}

/** `POST /api/me/devices`: the press of "Add a device". */
export interface DeviceInviteAnswer {
  invite: DeviceInvite;
}

/** `PATCH /api/owner/rooms/<address>` with `{ name }`: the room as renamed. Its address never changes. */
export interface RenameRoomAnswer {
  room: RoomSummary;
}

/** `GET /api/owner/rooms`: every room of the instance, oldest first, for the owner page's Rooms section. */
export interface OwnerRoomsAnswer {
  rooms: RoomSummary[];
}

/** A remembered device of a member, as the owner sees it on the People section. */
export interface MemberDevice {
  id: string;
  browser: string;
  os: string;
  /** When the device last visited, in milliseconds since the epoch. */
  lastUsed: number;
  /** Whether it is the owner's device asking. */
  current: boolean;
}

/** One member on the owner page's People section. */
export interface MemberEntry {
  id: string;
  name: string;
  owner: boolean;
  /** The addresses of the rooms they have access to, oldest room first. The owner has every room. */
  rooms: string[];
  /** The addresses of the rooms they are present in now. */
  present: string[];
  /** Their remembered devices, most recently used first. */
  devices: MemberDevice[];
  /** Their latest visit from any device, in milliseconds since the epoch; null with no device left. */
  lastVisit: number | null;
  /** The pending "Let back in" invite for them, if there is one. */
  letBackIn: PendingInvite | null;
}

/** `GET /api/owner/people`: every room, oldest first, and every member, oldest first (the owner first). */
export interface PeopleAnswer {
  rooms: RoomSummary[];
  people: MemberEntry[];
}

/**
 * `PUT /api/owner/people/<id>/rooms/<address>`, the tick that grants access, and
 * `DELETE` on the same address, the confirmed untick: the member as they are now.
 */
export interface GrantAnswer {
  person: MemberEntry;
}
