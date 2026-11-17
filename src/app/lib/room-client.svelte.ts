// The room client: the browser's side of the signaling connection. One per tab showing a
// room. It holds the whole room as the instance last sent it and applies each change as
// it arrives; the protocol is in `src/shared/socket/`.

import { applyMessage, roomSocketPath, type RoomView, type ServerMessage } from "../../shared/socket/index.ts";
import { getJson } from "./api.ts";

export class RoomClient {
  /** The room as the instance last described it, or null until the first full state. */
  view = $state<RoomView | null>(null);
  /** Whether the instance refused this tab the room, so the page shows "nothing here". */
  refused = $state(false);

  private readonly socket: WebSocket;

  constructor(private readonly address: string) {
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    this.socket = new WebSocket(`${scheme}//${window.location.host}${roomSocketPath(address)}`);
    this.socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      this.view = applyMessage(this.view, JSON.parse(event.data) as ServerMessage);
    });
    this.socket.addEventListener("close", () => {
      if (this.view === null) void this.checkRefused();
    });
  }

  /** Leaves the room: the instance ends this tab's presence at once. */
  close() {
    this.socket.close(1000, "left");
  }

  // A refused socket only shows the browser a failed connection, so ask the instance
  // over HTTP, where a refusal is the "nothing here" answer.
  private async checkRefused() {
    const room = await getJson(`/api/rooms/${encodeURIComponent(this.address)}`).catch(() => undefined);
    if (room === null) this.refused = true;
  }
}
