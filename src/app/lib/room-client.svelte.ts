// The room client: the browser's side of the signaling connection. One per tab showing a
// room. It holds the whole room as the instance last sent it and applies each change as
// it arrives; the protocol is in `src/shared/socket/`. Its connection beats and
// reconnects by itself (`connection.svelte.ts`), and a reconnect brings the whole room.

import { applyMessage, roomSocketPath, type RoomView, type ServerMessage } from "../../shared/socket/index.ts";
import { getJson } from "./api.ts";
import { Connection } from "./connection.svelte.ts";

export class RoomClient {
  /** The room as the instance last described it, or null until the first full state. */
  view = $state<RoomView | null>(null);

  private readonly connection: Connection<ServerMessage>;

  constructor(address: string) {
    this.connection = new Connection<ServerMessage>({
      path: roomSocketPath(address),
      receive: (message) => {
        this.view = applyMessage(this.view, message);
      },
      // A refusal is the "nothing here" answer; a failed request is no answer.
      refused: async () => (await getJson(`/api/rooms/${encodeURIComponent(address)}`)) === null,
    });
  }

  /** Whether the instance refused this tab the room, so the page shows "nothing here". */
  get refused(): boolean {
    return this.connection.refused;
  }

  /** Leaves the room: the instance ends this tab's presence at once. */
  close() {
    this.connection.close();
  }
}
