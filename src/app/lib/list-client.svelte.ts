// The list client: the browser's side of the list of rooms' connection. One per tab
// showing the list. It holds the whole list as the instance last sent it and applies each
// change as it arrives; the protocol is in `src/shared/socket/list.ts`. Holding it makes
// the member present nowhere. Its connection beats and reconnects by itself
// (`connection.svelte.ts`), and a reconnect brings the whole list.

import { applyListMessage, LIST_SOCKET_PATH, type ListMessage, type ListState } from "../../shared/socket/list.ts";
import { getJson } from "./api.ts";
import { Connection } from "./connection.svelte.ts";

export class ListClient {
  /** The list as the instance last described it, or null until the first full list. */
  list = $state<ListState | null>(null);

  private readonly connection = new Connection<ListMessage>({
    kind: "list",
    path: () => LIST_SOCKET_PATH,
    receive: (message) => {
      this.list = applyListMessage(this.list, message);
    },
    // A refusal is the "nothing here" answer; a failed request is no answer.
    refused: async () => (await getJson("/api/rooms")) === null,
  });

  /** Whether the instance refused this tab the list, so the page shows "nothing here". */
  get refused(): boolean {
    return this.connection.refused;
  }

  close() {
    this.connection.close();
  }
}
