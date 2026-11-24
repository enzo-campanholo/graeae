// The loopback's scenarios: the real media client (`src/app/lib/media/browser.ts`) on one
// tab's two media connections, against the stand-in media server in the same page, driven
// the way the room client drives it (`src/app/lib/room-client.svelte.ts`). Each reports
// what it saw for `loopback.spec.ts` to check.

import { BrowserMediaClient } from "../../../src/app/lib/media/browser.ts";
import type { Capture } from "../../../src/app/lib/media/client.ts";
import type { MediaPurpose } from "../../../src/shared/socket/index.ts";
import type { RunSeen, ShareSeen, WatchSeen } from "../observations.ts";
import { directionOf, liveSections, StandInMediaServer, ufragOf } from "./media-server.ts";

/** A moving 720p picture, as a webcam share's capture. */
function capture(): Capture {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext("2d")!;
  let frame = 0;
  const draw = () => {
    context.fillStyle = `hsl(${frame++ % 360} 80% 50%)`;
    context.fillRect(0, 0, canvas.width, canvas.height);
  };
  draw();
  const timer = setInterval(draw, 33);
  const stream = canvas.captureStream(30);
  stream.getVideoTracks()[0]!.addEventListener("ended", () => clearInterval(timer));
  return { kind: "webcam", stream, audio: false, ended: new Promise(() => undefined) };
}

/** A tab with both its media connections made, the stand-in, and what the run has seen. */
class Run {
  readonly client = new BrowserMediaClient();
  readonly server = new StandInMediaServer();
  readonly seen: RunSeen = { shares: [], ufrags: { sending: [], receiving: [] } };

  constructor() {
    this.client.connect("sending", [], () => undefined);
    this.client.connect("receiving", [], () => undefined);
  }

  /** The tab's description `sdp` on `connection`, its ufrag noted. */
  private note(sdp: string, connection: MediaPurpose = "sending"): string {
    const ufrag = ufragOf(sdp);
    if (ufrag) this.seen.ufrags[connection].push(ufrag);
    return sdp;
  }

  /** A share that goes live and is then stopped. */
  async share(): Promise<ShareSeen> {
    const shared = capture();
    const seen: ShareSeen = { mid: null, error: null, liveSections: 0, arrived: false };
    try {
      const offer = await this.client.offer(shared);
      seen.mid = offer.video;
      seen.liveSections = liveSections(this.note(offer.sdp));
      await this.client.accept(await this.server.answer(offer.sdp));
      seen.arrived = await this.server.decodes(offer.video);
    } catch (error) {
      seen.error = String(error);
    }
    this.client.stop(shared);
    this.seen.shares.push(seen);
    return seen;
  }

  /** A share the instance refuses: its offer is never answered, and its capture stops. */
  async refusedShare() {
    const shared = capture();
    await this.client.offer(shared);
    this.client.stop(shared);
  }

  /** A restart the media server never answers: abandoned, as on a refused or lost request. */
  async abandonedRestart() {
    await this.client.restart([]);
    await this.client.abandonRestart();
  }

  /** A restart the media server answers, as on a socket's return or a renewed credential. */
  async answeredRestart() {
    const { sdp } = await this.client.restart([]);
    await this.client.restarted(await this.server.answer(this.note(sdp)));
  }

  /** A watch of another member's share, through to the quality it arrives at. */
  async watch(): Promise<Omit<WatchSeen, keyof RunSeen>> {
    const { offer, mid } = await this.server.pull(capture().stream!.getVideoTracks()[0]!);
    const { answer } = await this.client.pull(offer, mid);
    await this.server.pulled(this.note(answer, "receiving"));
    const quality = await new Promise<string | null>((resolve) => {
      const stop = this.client.received(mid, (heard) => {
        if (heard === null) return;
        clearTimeout(timer);
        stop();
        resolve(heard);
      });
      const timer = setTimeout(() => {
        stop();
        resolve(null);
      }, 5000);
    });
    return { mid, answered: directionOf(answer, mid), quality };
  }

  /** Stops watching the share on `mid`, as the room client does: no negotiation until the next. */
  async unwatch(mid: string) {
    await this.server.unpull(mid);
    this.client.drop(mid);
  }

  close() {
    this.client.close();
    this.server.close();
  }
}

/** `count` shares in turn, each stopped before the next. */
export async function sharesInTurn(count: number): Promise<RunSeen> {
  const run = new Run();
  for (let share = 0; share < count; share++) await run.share();
  run.close();
  return run.seen;
}

/** Two shares, a third the instance refuses, then two more. */
export async function afterARefusedShare(): Promise<RunSeen> {
  const run = new Run();
  await run.share();
  await run.share();
  await run.refusedShare();
  await run.share();
  await run.share();
  run.close();
  return run.seen;
}

/** Two shares, an abandoned restart, then two more. */
export async function afterAnAbandonedRestart(): Promise<RunSeen> {
  const run = new Run();
  await run.share();
  await run.share();
  await run.abandonedRestart();
  await run.share();
  await run.share();
  run.close();
  return run.seen;
}

/**
 * Two shares stopped, a watch ended, which leaves its section inactive, a third share
 * and a restart, then a watch the stand-in puts on the ended watch's section. The watch
 * is on the receiving connection, which the shares and the restart never touch, and its
 * section is answered `recvonly` with no step from `inactive` in the tab.
 */
export async function watchOnAnEndedWatchsSection(): Promise<WatchSeen> {
  const run = new Run();
  await run.share();
  await run.share();
  const first = await run.watch();
  await run.unwatch(first.mid);
  await run.share();
  await run.answeredRestart();
  const watch = await run.watch();
  run.close();
  return { ...run.seen, ...watch };
}

/**
 * Ticket 60's order: a watch, a share stopped, another stopped, then a second watch, all
 * on one page. On one connection the second watch landed in a stopped share's section,
 * which the tab's offers had narrowed, and nothing decoded.
 */
export async function ticket60sOrder(): Promise<WatchSeen> {
  const run = new Run();
  await run.watch();
  await run.share();
  await run.share();
  const watch = await run.watch();
  run.close();
  return { ...run.seen, ...watch };
}
