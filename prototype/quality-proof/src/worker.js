// PROTOTYPE, throwaway. Answers the "Quality proof" ticket; not production code.
// One Worker serves the page and gates every media server call behind a shared key.
// One Durable Object keeps the list of live shares in memory and a wipeable stats log.
import { DurableObject } from "cloudflare:workers";

const SFU = "https://rtc.live.cloudflare.com/v1";
const json = (data, status = 200) => Response.json(data, { status });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return new Response("not found", { status: 404 });
    const key = request.headers.get("x-key") ?? url.searchParams.get("k");
    if (!env.ACCESS_KEY || key !== env.ACCESS_KEY) return json({ error: "wrong or missing key" }, 401);
    return env.ROOM.get(env.ROOM.idFromName("proof")).fetch(request);
  },
};

export class ProofRoom extends DurableObject {
  shares = new Map(); // shareId -> { id, client, name, label, sessionId, tracks:[{trackName, mid, kind}], cut }
  watches = new Map(); // watchId -> { sessionId, mids }
  seen = new Map(); // client -> last poll time
  cutSessions = new Map(); // sessionId -> { what, name, at }: kept after a forced close to see what Cloudflare does with them

  constructor(ctx, env) {
    super(ctx, env);
    // PROTOTYPE log, wipe me: POST /api/log-clear
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY, at INTEGER, row TEXT)");
  }

  async sfu(method, path, body) {
    if (!this.env.CF_APP_ID || !this.env.CF_APP_SECRET) throw new Error("CF_APP_ID / CF_APP_SECRET are not set on the Worker");
    const started = Date.now();
    const res = await fetch(`${SFU}/apps/${this.env.CF_APP_ID}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.env.CF_APP_SECRET}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok || data.errorCode) throw new Error(`media server ${path} -> ${res.status}: ${text.slice(0, 600)}`);
    data.ms = Date.now() - started;
    return data;
  }

  failedTracks(data) {
    const bad = (data.tracks ?? []).filter((t) => t.errorCode);
    if (bad.length) throw new Error("media server track error: " + JSON.stringify(bad));
  }

  // Asked straight after a forced close: does the session's own state already show it?
  async sessionState(sessionId) {
    try { const d = await this.sfu("GET", `/sessions/${sessionId}`); return { askMs: d.ms, tracks: d.tracks ?? d }; }
    catch (err) { return { error: String(err?.message ?? err) }; }
  }

  hasTurn() { return Boolean(this.env.TURN_KEY_ID && this.env.TURN_KEY_TOKEN); }

  async fetch(request) {
    const url = new URL(request.url);
    const route = url.pathname.slice(5);
    try {
      const body = request.method === "POST" ? await request.json() : {};
      return json(await this.handle(route, body, url));
    } catch (err) {
      return json({ error: String(err?.message ?? err) }, 500);
    }
  }

  async handle(route, body, url) {
    const now = Date.now();
    switch (route) {
      case "state": {
        const client = url.searchParams.get("client");
        if (client) this.seen.set(client, now);
        for (const [id, s] of this.shares) if (now - (this.seen.get(s.client) ?? 0) > 90_000) this.shares.delete(id);
        return {
          turn: this.hasTurn(),
          shares: [...this.shares.values()].map(({ id, client, name, label, cut, tracks }) => (
            { id, client, name, label, cut, kinds: tracks.map((t) => t.kind) })),
        };
      }

      case "ice": {
        const iceServers = [{ urls: "stun:stun.cloudflare.com:3478" }];
        let username = null;
        if (this.hasTurn()) {
          const res = await fetch(`${SFU}/turn/keys/${this.env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
            method: "POST",
            headers: { Authorization: `Bearer ${this.env.TURN_KEY_TOKEN}`, "content-type": "application/json" },
            body: JSON.stringify({ ttl: 14400 }),
          });
          if (!res.ok) throw new Error(`relay credentials -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
          const data = await res.json();
          iceServers.length = 0;
          for (const s of [data.iceServers].flat()) {
            // Port 53 is blocked by browsers and only slows ICE gathering down.
            const urls = [s.urls].flat().filter((u) => !/:53(\?|$)/.test(u));
            if (urls.length) iceServers.push({ ...s, urls });
            if (s.username) username = s.username;
          }
        }
        return { iceServers, username };
      }

      case "publish": {
        const { sessionId } = await this.sfu("POST", "/sessions/new");
        const tracks = body.tracks.map((t) => ({ ...t, trackName: `${t.kind}-${crypto.randomUUID()}` }));
        const data = await this.sfu("POST", `/sessions/${sessionId}/tracks/new`, {
          sessionDescription: { type: "offer", sdp: body.offer },
          tracks: tracks.map((t) => ({ location: "local", mid: t.mid, trackName: t.trackName })),
        });
        this.failedTracks(data);
        const id = crypto.randomUUID().slice(0, 8);
        this.seen.set(body.client, now);
        this.shares.set(id, { id, client: body.client, name: body.name, label: body.label, sessionId, tracks, cut: false });
        return { shareId: id, answer: data.sessionDescription.sdp };
      }

      case "unpublish": {
        const share = this.shares.get(body.shareId);
        this.shares.delete(body.shareId);
        if (share && !share.cut) {
          await this.sfu("PUT", `/sessions/${share.sessionId}/tracks/close`, {
            tracks: share.tracks.map((t) => ({ mid: t.mid })), force: true,
          }).catch(() => {});
        }
        return {};
      }

      case "watch": {
        // Pulls are built from the room's own record, never from identifiers a browser sends.
        const share = this.shares.get(body.shareId);
        if (!share) throw new Error("that share is gone");
        const { sessionId } = await this.sfu("POST", "/sessions/new");
        const data = await this.sfu("POST", `/sessions/${sessionId}/tracks/new`, {
          tracks: share.tracks.map((t) => ({ location: "remote", sessionId: share.sessionId, trackName: t.trackName })),
        });
        this.failedTracks(data);
        const watchId = crypto.randomUUID().slice(0, 8);
        this.watches.set(watchId, { sessionId, mids: data.tracks.map((t) => t.mid) });
        return { watchId, offer: data.sessionDescription.sdp };
      }

      case "watch-answer": {
        const watch = this.watches.get(body.watchId);
        if (!watch) throw new Error("unknown watch");
        await this.sfu("PUT", `/sessions/${watch.sessionId}/renegotiate`, {
          sessionDescription: { type: "answer", sdp: body.answer },
        });
        return {};
      }

      case "unwatch": {
        const watch = this.watches.get(body.watchId);
        this.watches.delete(body.watchId);
        if (watch) {
          await this.sfu("PUT", `/sessions/${watch.sessionId}/tracks/close`, {
            tracks: watch.mids.map((mid) => ({ mid })), force: true,
          }).catch(() => {});
        }
        return {};
      }

      // The removal test: force-close a sharer's tracks with no help from their browser.
      case "cut-share": {
        const share = this.shares.get(body.shareId);
        if (!share) throw new Error("that share is gone");
        const data = await this.sfu("PUT", `/sessions/${share.sessionId}/tracks/close`, {
          tracks: share.tracks.map((t) => ({ mid: t.mid })), force: true,
        });
        share.cut = true;
        this.cutSessions.set(share.sessionId, { what: "share", name: share.name, at: now });
        return { apiMs: data.ms, tracks: data.tracks, sessionAfter: await this.sessionState(share.sessionId) };
      }

      // The other half of removal: force-close one viewer's subscription.
      case "cut-watch": {
        const watch = this.watches.get(body.watchId);
        if (!watch) throw new Error("unknown watch");
        const data = await this.sfu("PUT", `/sessions/${watch.sessionId}/tracks/close`, {
          tracks: watch.mids.map((mid) => ({ mid })), force: true,
        });
        this.cutSessions.set(watch.sessionId, { what: "watch", at: now });
        return { apiMs: data.ms, tracks: data.tracks, sessionAfter: await this.sessionState(watch.sessionId) };
      }

      case "turn-revoke": {
        const started = Date.now();
        const res = await fetch(
          `${SFU}/turn/keys/${this.env.TURN_KEY_ID}/credentials/${encodeURIComponent(body.username)}/revoke`,
          { method: "POST", headers: { Authorization: `Bearer ${this.env.TURN_KEY_TOKEN}` } },
        );
        if (!res.ok) throw new Error(`relay revoke -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
        return { apiMs: Date.now() - started, status: res.status };
      }

      // What the media server says about every session this room knows, cut ones included.
      case "sessions": {
        const out = [];
        for (const s of this.shares.values()) out.push({ what: "share", name: s.name, cut: s.cut, sessionId: s.sessionId, state: await this.sessionState(s.sessionId) });
        for (const [id, w] of this.watches) out.push({ what: "watch", watchId: id, sessionId: w.sessionId, state: await this.sessionState(w.sessionId) });
        for (const [sessionId, c] of this.cutSessions) out.push({ ...c, cutSecondsAgo: Math.round((now - c.at) / 1000), sessionId, state: await this.sessionState(sessionId) });
        return out;
      }

      case "log": {
        if (body.rows) {
          for (const row of body.rows) this.ctx.storage.sql.exec("INSERT INTO log (at, row) VALUES (?, ?)", now, JSON.stringify(row));
          return { stored: body.rows.length };
        }
        return this.ctx.storage.sql.exec("SELECT row FROM log ORDER BY id").toArray().map((r) => JSON.parse(r.row));
      }

      case "log-clear":
        this.ctx.storage.sql.exec("DELETE FROM log");
        return {};

      default:
        throw new Error("no such route: " + route);
    }
  }
}
