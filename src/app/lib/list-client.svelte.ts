// The list client: the browser's side of the list of rooms' connection. One per tab
// showing the list. It holds the whole list as the instance last sent it and applies each
// change as it arrives; the protocol is in `src/shared/socket/list.ts`. Holding it makes
// the member present nowhere.

import { applyListMessage, LIST_SOCKET_PATH, type ListMessage, type ListState } from "../../shared/socket/list.ts";
import { getJson } from "./api.ts";

export class ListClient {
  /** The list as the instance last described it, or null until the first full list. */
  list = $state<ListState | null>(null);
  /** Whether the instance refused this tab the list, so the page shows "nothing here". */
  refused = $state(false);

  private readonly socket: WebSocket;

  constructor() {
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    this.socket = new WebSocket(`${scheme}//${window.location.host}${LIST_SOCKET_PATH}`);
    this.socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      this.list = applyListMessage(this.list, JSON.parse(event.data) as ListMessage);
    });
    this.socket.addEventListener("close", () => {
      if (this.list === null) void this.checkRefused();
    });
  }

  close() {
    this.socket.close(1000, "left");
  }

  // A refused socket only shows the browser a failed connection, so ask the instance
  // over HTTP, where a refusal is the "nothing here" answer.
  private async checkRefused() {
    const rooms = await getJson("/api/rooms").catch(() => undefined);
    if (rooms === null) this.refused = true;
  }
}
