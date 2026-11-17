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
