// What a tab does with the fresh relay credential the instance hands one of its media
// connections 11 hours after its last was minted for it (spec, Relay). On a direct path
// the tab takes it silently: the connection does not use the relay, and only needs the
// credential if it falls back to it. On the relay, since the credential it relays through
// runs out an hour later, the sending connection restarts with it, and reconnects the
// ordinary way if the restart fails; the receiving connection, never restarted, is
// replaced, whichever `ON_THE_RELAY` says (`room-client.svelte.ts`).

/**
 * How a sending connection on the relay takes up a fresh credential: "restart" restarts
 * its ICE with it, keeping every share; "reconnect" makes a new sending connection,
 * starting the shares again, the ordinary reconnect path.
 *
 * The one place to switch from the restart to the plain reconnect, should the owner's
 * check show the restart blips badly.
 */
export const ON_THE_RELAY: "restart" | "reconnect" = "restart";

/** What a tab does with a fresh credential: take it silently, restart, or reconnect. */
export type Renewal = "silently" | "restart" | "reconnect";

/** What a tab does with a fresh credential, the connection it is for being on the relay now or not. */
export function renewal(relayed: boolean, onTheRelay: "restart" | "reconnect" = ON_THE_RELAY): Renewal {
  return relayed ? onTheRelay : "silently";
}
