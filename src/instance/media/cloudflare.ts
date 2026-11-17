// The media layer on Cloudflare: Realtime SFU (the media server) and its TURN relay, in
// the owner's account. Only the instance calls it (ADR 0003), with the application's
// secret, which never leaves the backend; the relay key is used only to mint relay
// credentials.
//
// No test reaches this file: nothing automated talks to Cloudflare. It is kept thin, one
// HTTPS call per operation, so it can be read against the spec and the API it was
// ported from (`prototype/quality-proof`, `docs/research/media-server-access.md` on the
// branch `research/media-server-access`). Ticket 13 proves it on a deployed instance.
//
// The calls, all under https://rtc.live.cloudflare.com/v1/apps/{SFU_APP_ID}:
//
// | Operation      | Call                                                                  |
// |----------------|-----------------------------------------------------------------------|
// | connect        | POST sessions/new                                                     |
// | publish        | POST sessions/{id}/tracks/new, local tracks and the browser's offer   |
// | pull           | POST sessions/{id}/tracks/new, remote tracks; gives the server's offer |
// | setQuality     | PUT sessions/{id}/tracks/update, the pulled track's simulcast choice  |
// | renegotiate    | PUT sessions/{id}/renegotiate, the browser's answer                   |
// | close          | PUT sessions/{id}/tracks/close, force: true                           |
// | tracks         | GET sessions/{id}                                                     |
//
// and the relay credential is POST https://rtc.live.cloudflare.com/v1/turn/keys/
// {TURN_KEY_ID}/credentials/generate-ice-servers.
//
// Two qualities are simulcast: the sharer's browser sends one encode per quality, each
// with its rid (`RIDS` in `src/shared/encoding.ts`), and each viewer's pull names the one
// it prefers (developers.cloudflare.com/realtime/sfu/simulcast/). The owner's real-media
// pass (ticket 27) proves it.

import { RIDS } from "../../shared/encoding.ts";
import type { IceServer } from "../../shared/socket/media.ts";
import type { MediaConnectionId, MediaLayer, Pulled, QualityChoice, Track } from "./layer.ts";

const API = "https://rtc.live.cloudflare.com/v1";

/**
 * What the media server is told of a viewer's choice. "Auto" prefers 1080p and lets the
 * media server step down to 720p when this viewer's link cannot carry it; a fixed choice
 * keeps its quality whatever the link. Either way, a quality the sharer stops sending
 * (a weak upload) gives way to the other.
 */
function simulcast(quality: QualityChoice) {
  return {
    preferredRid: RIDS[quality === "720p" ? "720p" : "1080p"],
    priorityOrdering: quality === "auto" ? "asciibetical" : "none",
    ridNotAvailable: "asciibetical",
  };
}

/** A call that takes longer is given up. Its record stays, as for any failed call. */
const TIMEOUT_MS = 10_000;

/** One track in an answer from the media server. A track that failed carries an error code. */
interface TrackResult {
  mid?: string;
  trackName?: string;
  status?: string;
  errorCode?: string;
  errorDescription?: string;
}

interface SessionDescription {
  type: "offer" | "answer";
  sdp: string;
}

/** What the media server answers. A failed request carries an error code, whatever its HTTP status. */
interface Answer {
  sessionId?: string;
  sessionDescription?: SessionDescription;
  requiresImmediateRenegotiation?: boolean;
  tracks?: TrackResult[];
  errorCode?: string;
  errorDescription?: string;
}

/** A call the media server refused, with its HTTP status. */
export class MediaServerError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class CloudflareMediaServer implements MediaLayer {
  constructor(private readonly env: Env) {}

  async connect(): Promise<MediaConnectionId> {
    const { sessionId } = await this.sfu("POST", "/sessions/new");
    if (!sessionId) throw new Error("The media server made no session");
    return sessionId;
  }

  async publish(connection: MediaConnectionId, offer: string, tracks: readonly Track[]): Promise<string> {
    const answer = await this.sfu("POST", `/sessions/${connection}/tracks/new`, {
      sessionDescription: { type: "offer", sdp: offer },
      tracks: tracks.map(({ name, mid }) => ({ location: "local", trackName: name, mid })),
    });
    failedTracks(answer.tracks);
    if (answer.sessionDescription?.type !== "answer") throw new Error("The media server gave no answer to a publish");
    return answer.sessionDescription.sdp;
  }

  async pull(
    connection: MediaConnectionId,
    from: MediaConnectionId,
    names: readonly string[],
    preferred?: { name: string; quality: QualityChoice },
  ): Promise<Pulled> {
    // Built from the instance's own records: the sharer's session and the track names it picked.
    const answer = await this.sfu("POST", `/sessions/${connection}/tracks/new`, {
      tracks: names.map((name) => ({
        location: "remote",
        sessionId: from,
        trackName: name,
        ...(preferred?.name === name ? { simulcast: simulcast(preferred.quality) } : {}),
      })),
    });
    failedTracks(answer.tracks);
    if (answer.sessionDescription?.type !== "offer") throw new Error("The media server gave no offer for a pull");
    const tracks = names.map((name, index) => {
      const pulled = answer.tracks?.find((track) => track.trackName === name) ?? answer.tracks?.[index];
      if (!pulled?.mid) throw new Error(`The media server gave no mid for the pulled track ${name}`);
      return { name, mid: pulled.mid };
    });
    return { offer: answer.sessionDescription.sdp, tracks };
  }

  async setQuality(connection: MediaConnectionId, from: MediaConnectionId, track: Track, quality: QualityChoice): Promise<void> {
    const answer = await this.sfu("PUT", `/sessions/${connection}/tracks/update`, {
      tracks: [
        { location: "remote", sessionId: from, trackName: track.name, mid: track.mid, simulcast: simulcast(quality) },
      ],
    });
    failedTracks(answer.tracks);
  }

  async renegotiate(connection: MediaConnectionId, answer: string): Promise<void> {
    await this.sfu("PUT", `/sessions/${connection}/renegotiate`, {
      sessionDescription: { type: "answer", sdp: answer },
    });
  }

  async close(connection: MediaConnectionId, tracks: readonly Track[]): Promise<void> {
    if (tracks.length === 0) return;
    let answer: Answer;
    try {
      // Forced: the media stops with no SDP exchange, so nothing is needed from the browser.
      answer = await this.sfu("PUT", `/sessions/${connection}/tracks/close`, {
        tracks: tracks.map(({ mid }) => ({ mid })),
        force: true,
      });
    } catch (error) {
      // 410: the browser's side is gone, so the session carries nothing any more.
      if (error instanceof MediaServerError && error.status === 410) return;
      throw error;
    }
    const failed = (answer.tracks ?? []).filter((track) => track.errorCode);
    if (failed.length === 0) return;
    // A track that is not there may report an error too. Each one counts as closed only
    // if the session itself no longer has it open.
    const open = new Set((await this.tracks(connection)).map((track) => track.mid));
    const stillOpen = failed.filter((track) => track.mid !== undefined && open.has(track.mid));
    if (stillOpen.length > 0) throw new Error(`The media server did not close ${describe(stillOpen)}`);
  }

  async relayCredential(ttlSeconds: number): Promise<IceServer[]> {
    const response = await fetch(`${API}/turn/keys/${this.env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.env.TURN_KEY_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: ttlSeconds }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new MediaServerError(response.status, `The relay refused a credential: ${response.status}`);
    const { iceServers } = await response.json<{ iceServers: IceServer | IceServer[] }>();
    // Every address the relay gives: STUN, and TURN over UDP, TCP and TLS. Port 53 is
    // left out, since browsers block it and it only slows the connection down.
    return [iceServers]
      .flat()
      .map((server) => ({ ...server, urls: [server.urls].flat().filter((url) => !/:53(\?|$)/.test(url)) }))
      .filter((server) => server.urls.length > 0);
  }

  async tracks(connection: MediaConnectionId): Promise<Track[]> {
    let answer: Answer;
    try {
      answer = await this.sfu("GET", `/sessions/${connection}`);
    } catch (error) {
      // 410: the browser's side is gone, so the session carries nothing any more.
      if (error instanceof MediaServerError && error.status === 410) return [];
      throw error;
    }
    // A closed track stays listed as inactive; any other status is a track still open.
    return (answer.tracks ?? [])
      .filter((track) => track.status !== "inactive" && track.mid)
      .map((track) => ({ name: track.trackName ?? "", mid: track.mid! }));
  }

  /** One call to the media server, with the application's secret. */
  private async sfu(method: "GET" | "POST" | "PUT", path: string, body?: object): Promise<Answer> {
    const response = await fetch(`${API}/apps/${this.env.SFU_APP_ID}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.env.SFU_APP_SECRET}`, "Content-Type": "application/json" },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await response.text();
    let answer: Answer = {};
    try {
      answer = text ? (JSON.parse(text) as Answer) : {};
    } catch {
      // Not JSON: the status says what happened.
    }
    if (!response.ok || answer.errorCode) {
      const reason = answer.errorDescription ?? answer.errorCode ?? text.slice(0, 200);
      throw new MediaServerError(response.status, `The media server refused ${method} ${path}: ${response.status} ${reason}`);
    }
    return answer;
  }
}

/** Throws if the media server refused any track of a call, though the call itself succeeded. */
function failedTracks(tracks: readonly TrackResult[] = []) {
  const failed = tracks.filter((track) => track.errorCode);
  if (failed.length > 0) throw new Error(`The media server refused ${describe(failed)}`);
}

function describe(tracks: readonly TrackResult[]): string {
  return tracks.map((track) => `mid ${track.mid}: ${track.errorCode} ${track.errorDescription ?? ""}`.trim()).join("; ");
}
