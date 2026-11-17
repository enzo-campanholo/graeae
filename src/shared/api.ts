// The shapes of the instance's HTTP answers, shared by the instance and the page.

export interface RoomSummary {
  address: string;
  name: string;
}

/** Who the visiting device belongs to. */
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
