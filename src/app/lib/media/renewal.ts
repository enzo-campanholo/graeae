// What a tab does with the fresh relay credential the instance hands it 11 hours after
// its last was minted (spec, Relay). A tab on a direct path takes it silently: its
// connection does not use the relay, and only needs the credential if it falls back to
// it. A tab on the relay restarts its connection with it, since the credential it relays
// through runs out an hour later; if the restart fails, it reconnects the ordinary way.

/**
 * How a tab on the relay takes up a fresh credential: "restart" restarts the media
 * connection's ICE with it, keeping every share and watch; "reconnect" makes a new media
 * connection, starting the shares again and watching again, the ordinary reconnect path.
 *
 * The one place to switch from the restart to the plain reconnect, should the owner's
 * check show the restart blips badly.
 */
export const ON_THE_RELAY: "restart" | "reconnect" = "restart";

/** What a tab does with a fresh credential: take it silently, restart, or reconnect. */
export type Renewal = "silently" | "restart" | "reconnect";

/** What a tab does with a fresh credential, its media connection being on the relay now or not. */
export function renewal(relayed: boolean, onTheRelay: "restart" | "reconnect" = ON_THE_RELAY): Renewal {
  return relayed ? onTheRelay : "silently";
}
