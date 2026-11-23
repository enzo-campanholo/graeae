# A tab sends on one media connection and receives on another

Status: accepted (2026-11-23). It replaces the spec's "one media connection, used for both what it shares and what it watches".

Each tab can hold two media connections. A **sending connection** is made the first time the tab shares, and carries only its shares. A **receiving connection** is made the first time it watches, and carries only its watching. The tab never makes an offer on the receiving connection. Every negotiation on it starts with an offer from the media server, which the tab answers, and that includes how it gets a new path.

Tickets 57, 58 and 60 had one cause. On one connection, a section the tab had narrowed to its sending codecs (`42001f` alone, from the encoding plan) was later reused by the media server for a watch. The watch then went out on a payload type that the reused section did not list, and Chrome dropped every packet. It also depended on things the tab cannot control, all recorded in `docs/media-server.md`:
- which section the media server reuses;
- what codecs it lists in that section;
- which payload type it picks from the tab's last offer.

Each fix closed one order of shares and watches, and the next ticket found another. With the two kept apart, no watch can land in a section the tab narrowed for sending, and there is no tab offer on the receiving connection for the media server to read a codec list from.

## Considered options

- **Keep one connection, and keep patching which codecs each section offers** (`receiving.ts`, ticket 58). This was rejected because every fix rests on media server behaviour that was only seen, not documented, and 60 broke 58's fix within a day.
- **One connection, where the tab offers each pull itself** (the tab adds a `recvonly` transceiver and makes the offer). This was rejected because the media server makes the offer for a pull (`tracks/new` with remote tracks), and taking a tab's offer there is not documented.
- **A new connection for each share or watch.** This was rejected: it would mean one ICE and DTLS handshake, and one relay allocation, for every share and watch, all to fix something two connections already fix.
- **Restart the receiving connection in place**, as the sending one does. This was rejected because the media server takes no restart offer without a track of the tab's own (`restart` in `cloudflare.ts`), and a tab offer on that connection is exactly what this decision keeps off it.

## Consequences

- **What a section offers.** On the sending connection, sections are narrowed by the encoding plan, and 57's rules for stopping a share still hold (`stopping.ts`, the BUNDLE tag). On the receiving connection, every section is the media server's own, with its own codec list. `receiving.ts`, and the stand-in media server's copy of the codec-list behaviour, are no longer needed.
- **The receiving connection is replaced, never restarted.**
  - When the browser gives it up, the tab makes a new receiving connection and the instance pulls every watch again onto it.
  - When its relay credential is renewed and the tab is on the relay, the same happens. That is once every 11 hours, and each watched picture blinks for a second or two.
  - Only the sending connection is restarted in place, with its spare transceiver.
- **Shares.** Only the sending connection's faltering keeps a share live for 30 seconds. A faltering receiving connection ends no share.
- **Usage counts the receiving connection only.** Its transport's running total is what Cloudflare bills, since a sharer's upload is not billed. A tab sends a final total before its receiving connection is replaced. The sending connection reports nothing.
- **Each connection has its own relay credential**, minted when the connection is made and renewed at 11 hours.
- **The instance keeps both connections.**
  - It records up to two connections per tab, one for each purpose.
  - A share names the sending connection; a watch names the receiving one.
  - A pull goes from the sharer's sending connection to the watcher's receiving connection.
  - The sweep, the cut-off and letting go of an empty connection all work per connection.
- **The cost.** A tab that both shares and watches holds two connections: two ICE and DTLS handshakes, and on the relay two allocations. A tab's first share made after it has started watching waits on one more `sessions/new`. Neither costs anything on Cloudflare's bill, which counts bytes, not sessions.
- **No compatibility.** v1 is not released, so the change breaks the socket protocol and the connection records without keeping the old one-connection protocol: the migration drops what `graeae-test` holds.
