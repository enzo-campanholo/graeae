// The real media client: the webcam through `getUserMedia`, a screen and its screen audio
// through `getDisplayMedia`, and the tab's two media connections to the media server
// (ADR 0005), each an `RTCPeerConnection` of its own: the sending one, which carries what
// the tab shares and on which it makes every offer, and the receiving one, which carries
// what it watches and only ever answers the media server's offers.
//
// Seam 2 runs on the fake. Its negotiations run in the loopback (`test/loopback`), in a
// real Chromium against a stand-in for the media server; what the media server does that
// the stand-in does not is in `docs/media-server.md`, which a change to a negotiation here
// is read against. It is kept thin enough to read against the spec's Screen audio,
// Encoding and quality and Relay sections; what a screen capture asks for, the encoding
// plan, how the browser's API takes it, and what a live share sends on a weak upload with
// the notes its sharer sees, and how a stopped share's transceiver is let go of, are pure
// rules in `capture.ts`, `src/shared/encoding.ts`, `encodings.ts`, `sending.ts` and
// `stopping.ts`, which are tested. The owner's real-media pass (tickets 13 and 27) proves
// it on a deployed instance.

import { encodingPlan, type Codec, type Degradation, type EncodingPlan, type QualityName } from "../../../shared/encoding.ts";
import type { IceServer, MediaPurpose } from "../../../shared/socket/index.ts";
import { USAGE_REPORT_EVERY_MS } from "../../../shared/socket/usage.ts";
import { browserFamily, isScreenAudio, screenCapture, stereoOpus, type BrowserFamily } from "./capture.ts";
import type { Capture, MediaClient, MediaHealth, Offer } from "./client.ts";
import { codecPreferences, hardwareQuery, lists, receivedQuality, sendEncodings } from "./encodings.ts";
import { follow, NotesBoard, READ_EVERY_MS, readingOf, type SharerNotes } from "./sending.ts";
import { stopping } from "./stopping.ts";
import { transportTotals, type StatsEntry, type TransportTotals } from "./transport.ts";
import { pairSummary, STATS_EVERY_MS, streamSummaries, type CaptureNow, type Counted } from "./stats.ts";
import { every } from "../ticker.ts";
import { tabLog } from "../log.ts";

/** How often a watched share's statistics are read for the quality it arrives at. */
const RECEIVED_EVERY_MS = 2000;

/** How each state of a connection reads; the others leave it as it was. */
const HEALTH: Partial<Record<RTCPeerConnectionState, MediaHealth>> = {
  connected: "fine",
  disconnected: "faltering",
  failed: "failed",
};

/** How long a restarted connection has to find its path again before the restart counts as failed. */
const RESTART_WAIT_MS = 15_000;

/** One of the tab's media connections, and how to stop its statistics going in the page's log. */
interface Peer {
  connection: RTCPeerConnection;
  stopStats: () => void;
}

export class BrowserMediaClient implements MediaClient {
  readonly browser: BrowserFamily = browserFamily(navigator.userAgent);
  readonly reportEvery = USAGE_REPORT_EVERY_MS;
  /** The tab's media connections, each made on first use. */
  private readonly peers: Record<MediaPurpose, Peer | null> = { sending: null, receiving: null };
  /** The receiving connection the last `replace` replaced, still showing what it receives until `retire`. */
  private replaced: Peer | null = null;
  /** The empty transceiver the last restart offer carried, until the media server answers it. */
  private spare: RTCRtpTransceiver | null = null;
  /** The transceivers sending each capture, so stopping one stops its sending. */
  private readonly sending = new Map<Capture, RTCRtpTransceiver[]>();
  /** The last offer's capture, its video transceiver, plan and capture height, followed once it is accepted. */
  private offered: { capture: Capture; transceiver: RTCRtpTransceiver; plan: EncodingPlan; height?: number } | null =
    null;
  /** How to stop reading each live share's statistics. */
  private readonly following = new Map<Capture, () => void>();
  /** The notes on each live share, for its sharer. */
  private readonly board = new NotesBoard<Capture>();

  plan(kind: Capture["kind"]): EncodingPlan {
    return encodingPlan(this.browser, kind);
  }

  async captureWebcam(): Promise<Capture> {
    const { width, height, frameRate } = this.plan("webcam").capture;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: frameRate, max: frameRate } },
      audio: false,
    });
    watchTracks("webcam", stream);
    return { kind: "webcam", stream, audio: false, ended: endedOf(stream) };
  }

  async captureScreen(): Promise<Capture | null> {
    let stream: MediaStream;
    try {
      // Chromium's picker hints are not in the DOM's types yet.
      stream = await navigator.mediaDevices.getDisplayMedia(screenCapture(this.browser) as DisplayMediaStreamOptions);
    } catch (error) {
      // The member closed the picker without picking, or said no: nothing to share.
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        tabLog.info("capture.refused", { kind: "screen", error });
        return null;
      }
      throw error;
    }
    watchTracks("screen", stream);
    // A game moves: the encoder treats the picture as motion rather than a still document.
    // What it gives up first on a short upload is the plan's `degradation`, set with the
    // encodings: a Chromium screen share keeps its size and gives up frame rate.
    for (const track of stream.getVideoTracks()) track.contentHint = "motion";
    // Audio that is not screen audio is stopped, so the browser lets go of it, and taken
    // out of the stream, so the share goes out video only as if the picker gave none.
    for (const track of stream.getAudioTracks()) {
      if (isScreenAudio(track.label)) continue;
      track.stop();
      stream.removeTrack(track);
      tabLog.warn("capture.audio-dropped", { kind: "screen" });
    }
    return { kind: "screen", stream, audio: stream.getAudioTracks().length > 0, ended: endedOf(stream) };
  }

  connect(purpose: MediaPurpose, iceServers: IceServer[], health: (health: MediaHealth) => void) {
    this.shut(purpose);
    this.peers[purpose] = this.made(purpose, iceServers, health);
  }

  replace(iceServers: IceServer[], health: (health: MediaHealth) => void) {
    this.retire();
    this.replaced = this.peers.receiving;
    this.peers.receiving = this.made("receiving", iceServers, health);
  }

  retire() {
    if (!this.replaced) return;
    this.replaced.stopStats();
    this.replaced.connection.close();
    this.replaced = null;
  }

  /** A new media connection for `purpose`, offering the relay in `iceServers`, whose health `health` hears. */
  private made(purpose: MediaPurpose, iceServers: IceServer[], health: (health: MediaHealth) => void): Peer {
    // The relay is offered from the start, over UDP, TCP and TLS, in `iceServers`; the
    // browser uses a direct path whenever one works.
    const connection = new RTCPeerConnection({ iceServers, bundlePolicy: "max-bundle" });
    const current = () => this.peers[purpose]?.connection === connection;
    // "disconnected" is the browser losing its path and looking for another by itself;
    // "failed" is it giving up, which the room client answers with a restart of the
    // sending connection, or a new receiving connection.
    let was: MediaHealth = "fine";
    connection.addEventListener("connectionstatechange", () => {
      if (!current()) return;
      const state = connection.connectionState;
      (state === "failed" || state === "disconnected" ? tabLog.warn : tabLog.info).call(tabLog, "pc.connection", { connection: purpose, state });
      const now = HEALTH[state] ?? was;
      if (now !== was) health(now);
      was = now;
    });
    // Every state change goes in the page's log, and the pair in use once there is one.
    let pair = "";
    const logPair = async () => {
      const stats = await connection.getStats().catch(() => null);
      const now = stats && pairSummary(stats.values() as Iterable<StatsEntry>);
      if (now && JSON.stringify(now) !== pair) {
        pair = JSON.stringify(now);
        tabLog.info("pc.pair", { connection: purpose, ...now });
      }
    };
    connection.addEventListener("iceconnectionstatechange", () => {
      const state = connection.iceConnectionState;
      (state === "failed" || state === "disconnected" ? tabLog.warn : tabLog.info).call(tabLog, "pc.ice", { connection: purpose, state });
      if (state === "connected" || state === "completed") void logPair();
    });
    connection.addEventListener("icegatheringstatechange", () =>
      tabLog.info("pc.gathering", { connection: purpose, state: connection.iceGatheringState }),
    );
    connection.addEventListener("signalingstatechange", () =>
      tabLog.info("pc.signaling", { connection: purpose, state: connection.signalingState }),
    );
    // A summary of every stream every 15 seconds, while there is any.
    const counted: Counted = new Map();
    const stopStats = every(STATS_EVERY_MS, () => {
      if (!current()) return;
      void connection
        .getStats()
        .then((stats) => {
          const summaries = streamSummaries(stats.values() as Iterable<StatsEntry>, counted, this.capturesNow());
          for (const summary of summaries) tabLog.info("stats", { ...summary });
          return logPair();
        })
        .catch(() => undefined);
    });
    return { connection, stopStats };
  }

  /**
   * Each sent picture's track as it is now, by its id: a shared tab's size moves with its
   * viewport, so it is read at every summary, not only when the capture starts.
   */
  private capturesNow(): Map<string, CaptureNow> {
    const now = new Map<string, CaptureNow>();
    for (const capture of this.sending.keys()) {
      for (const track of capture.stream?.getVideoTracks() ?? []) {
        const { width, height, displaySurface } = track.getSettings() as MediaTrackSettings & { displaySurface?: string };
        now.set(track.id, { surface: displaySurface, width, height });
      }
    }
    return now;
  }

  renew(purpose: MediaPurpose, iceServers: IceServer[]) {
    const connection = this.peers[purpose]?.connection;
    if (!connection || connection.signalingState === "closed") return;
    try {
      // Used the next time the browser gathers candidates; the path in use is left alone.
      connection.setConfiguration({ ...connection.getConfiguration(), iceServers });
    } catch {
      // A browser that refuses keeps its credential until it runs out, an hour later.
    }
  }

  async relayed(purpose: MediaPurpose): Promise<boolean> {
    const stats = await this.peers[purpose]?.connection.getStats().catch(() => null);
    return stats ? transportTotals(stats.values() as Iterable<StatsEntry>).relayed : false;
  }

  async restart(iceServers: IceServer[]): Promise<{ sdp: string; mid: string }> {
    this.renew("sending", iceServers);
    const connection = await this.settled();
    // The media server takes no offer without a track: this one sends nothing.
    const spare = connection.addTransceiver("audio", { direction: "sendonly" });
    this.spare = spare;
    const offer = await connection.createOffer({ iceRestart: true });
    await connection.setLocalDescription({ type: "offer", sdp: stereoOpus(offer.sdp ?? "") });
    if (!connection.localDescription || spare.mid === null) throw new Error("The browser made no restart offer");
    return { sdp: connection.localDescription.sdp, mid: spare.mid };
  }

  async abandonRestart() {
    const connection = this.peers.sending?.connection;
    if (!connection || connection.signalingState !== "have-local-offer") return;
    await connection.setLocalDescription({ type: "rollback" });
    // Never negotiated, so made inactive, not stopped: once a share's transceiver has been
    // stopped, a stopped spare makes Chrome refuse every later offer (ticket 57). It goes
    // out with the next offer as an inactive section.
    if (this.spare) this.spare.direction = "inactive";
    this.spare = null;
  }

  async restarted(answer: string) {
    const connection = this.peer("sending");
    await connection.setRemoteDescription({ type: "answer", sdp: stereoOpus(answer) });
    // The browser checks the new candidates, through the relay with the fresh credential,
    // and moves to the pair it finds. It may stay "connected" on the old pair meanwhile.
    await new Promise<void>((resolve, reject) => {
      const done = (error?: Error) => {
        clearTimeout(timer);
        connection.removeEventListener("iceconnectionstatechange", check);
        connection.removeEventListener("icegatheringstatechange", check);
        if (error) reject(error);
        else resolve();
      };
      const check = () => {
        const state = connection.iceConnectionState;
        if (state === "failed" || state === "closed") done(new Error(`The restart ended ${state}`));
        else if ((state === "connected" || state === "completed") && connection.iceGatheringState === "complete") done();
      };
      const timer = setTimeout(() => done(new Error("The restart found no path in time")), RESTART_WAIT_MS);
      connection.addEventListener("iceconnectionstatechange", check);
      connection.addEventListener("icegatheringstatechange", check);
      check();
    });
  }

  async offer(capture: Capture): Promise<Offer> {
    const connection = await this.settled();
    const streams = capture.stream ? [capture.stream] : [];
    const [video] = capture.stream?.getVideoTracks() ?? [];
    const [audio] = capture.stream?.getAudioTracks() ?? [];
    if (!video) throw new Error("The capture has no picture to send");
    const plan = this.plan(capture.kind);
    // One encoding per quality, each scaled down to its height: a larger monitor to 1080p.
    const height = video.getSettings().height;
    const encodings = sendEncodings(plan, height);
    const videoSender = connection.addTransceiver(video, { direction: "sendonly", streams, sendEncodings: encodings });
    // Before the offer, which carries the codecs offered.
    await preferCodecs(videoSender, plan);
    // A screen share's sound goes with its picture, as one unit.
    const audioSender = audio ? connection.addTransceiver(audio, { direction: "sendonly", streams }) : null;
    this.sending.set(capture, audioSender ? [videoSender, audioSender] : [videoSender]);
    this.offered = { capture, transceiver: videoSender, plan, ...(height === undefined ? {} : { height }) };
    const offer = await connection.createOffer();
    await connection.setLocalDescription({ type: "offer", sdp: stereoOpus(offer.sdp ?? "") });
    if (!videoSender.mid || !connection.localDescription) throw new Error("The offer gave the capture no mid");
    if (audioSender && !audioSender.mid) throw new Error("The offer gave the capture's sound no mid");
    return {
      sdp: connection.localDescription.sdp,
      video: videoSender.mid,
      ...(audioSender?.mid ? { audio: audioSender.mid } : {}),
    };
  }

  async accept(answer: string) {
    // Stereo both ways, whatever the media server's answer says of it.
    await this.peer("sending").setRemoteDescription({ type: "answer", sdp: stereoOpus(answer) });
    const offered = this.offered;
    this.offered = null;
    if (offered) this.follow(offered.capture, offered.transceiver.sender, offered.plan, offered.height);
  }

  notes(capture: Capture, heard: (notes: SharerNotes) => void): () => void {
    return this.board.listen(capture, heard);
  }

  /**
   * Follows the live share of `capture` on `sender`: its limits are set again now that it
   * is negotiated, in case the browser let them go in the offer, and its statistics are
   * read every few seconds, from a tick that keeps going while the sharer's tab is hidden
   * behind their game. A step down or up changes the live share's encodings, with no new
   * negotiation.
   */
  private follow(capture: Capture, sender: RTCRtpSender, plan: EncodingPlan, height: number | undefined) {
    this.following.get(capture)?.();
    const read = follow(plan, height, performance.now(), {
      apply: (encodings, degradation) => {
        const parameters = sender.getParameters() as RTCRtpSendParameters & {
          degradationPreference?: Degradation;
        };
        parameters.encodings = encodings.map((limits, index) => ({ ...parameters.encodings?.[index], ...limits }));
        parameters.degradationPreference = degradation;
        void sender.setParameters(parameters).catch(() => undefined);
      },
      notes: (notes) => this.board.tell(capture, notes),
    });
    const stop = every(READ_EVERY_MS, () => {
      void sender
        .getStats()
        .then((stats) => read(readingOf(stats.values() as Iterable<StatsEntry>, performance.now())))
        .catch(() => undefined);
    });
    this.following.set(capture, stop);
  }

  /** Stops reading the statistics of the share of `capture`, which is no longer sent. */
  private unfollow(capture: Capture) {
    this.following.get(capture)?.();
    this.following.delete(capture);
    this.board.forget(capture);
  }

  async pull(offer: string, video: string, audio?: string) {
    // The tab never offers on the receiving connection, so there is nothing to roll back:
    // each of its sections is the media server's. Chrome makes each transceiver `recvonly`
    // from the offer that adds it and keeps it so, a reused section too, since the tab never
    // sets a direction here; it answered `inactive` only for a section the tab had made for
    // a share (`docs/media-server.md`; the loopback's reused section checks it).
    const connection = this.peer("receiving");
    await connection.setRemoteDescription({ type: "offer", sdp: offer });
    const tracks = [video, ...(audio === undefined ? [] : [audio])].map((mid) => {
      const transceiver = this.transceiver(mid);
      if (!transceiver) throw new Error(`The media server's offer has no transceiver ${mid}`);
      return transceiver.receiver.track;
    });
    const answer = await connection.createAnswer();
    await connection.setLocalDescription({ type: "answer", sdp: stereoOpus(answer.sdp ?? "") });
    if (!connection.localDescription) throw new Error("The browser made no answer");
    return { answer: connection.localDescription.sdp, stream: new MediaStream(tracks) };
  }

  received(video: string, heard: (quality: QualityName | null) => void): () => void {
    let last: QualityName | null | undefined;
    const read = async () => {
      const receiver = this.transceiver(video)?.receiver;
      let height: number | undefined;
      for (const report of (await receiver?.getStats().catch(() => null))?.values() ?? []) {
        if (report.type === "inbound-rtp" && report.kind === "video") height = report.frameHeight;
      }
      const quality = receivedQuality(height);
      if (quality !== last) heard((last = quality));
    };
    void read();
    const timer = setInterval(() => void read(), RECEIVED_EVERY_MS);
    return () => clearInterval(timer);
  }

  async transport(): Promise<TransportTotals | null> {
    const stats = await this.peers.receiving?.connection.getStats().catch(() => null);
    return stats ? transportTotals(stats.values() as Iterable<StatsEntry>) : null;
  }

  drop(video: string) {
    // The media server has closed the pull, so nothing arrives on it. Its transceivers
    // stay on the receiving connection until the media server's next offer settles them.
    void video;
  }

  setAudio(capture: Capture, on: boolean) {
    // A disabled track sends silence: the share stays live, with no sound.
    for (const track of capture.stream?.getAudioTracks() ?? []) track.enabled = on;
  }

  stop(capture: Capture) {
    this.unfollow(capture);
    for (const track of capture.stream?.getTracks() ?? []) track.stop();
    const connection = this.peers.sending?.connection;
    const localSdp = connection?.currentLocalDescription?.sdp;
    for (const transceiver of this.sending.get(capture) ?? []) {
      if (connection?.signalingState === "closed") break;
      // The media server has force-closed its track already; `stopping` says why most
      // are stopped and some only made inactive.
      if (stopping(transceiver, localSdp) === "stop") transceiver.stop();
      else {
        void transceiver.sender.replaceTrack(null);
        transceiver.direction = "inactive";
      }
    }
    this.sending.delete(capture);
  }

  close() {
    for (const capture of [...this.sending.keys()]) this.stop(capture);
    this.reset("sending");
    this.reset("receiving");
  }

  reset(purpose: MediaPurpose) {
    this.shut(purpose);
    if (purpose === "receiving") {
      this.retire();
      return;
    }
    for (const capture of [...this.following.keys()]) this.unfollow(capture);
    this.spare = null;
    this.sending.clear();
    this.offered = null;
  }

  /** Closes the connection for `purpose`, if the tab has one. */
  private shut(purpose: MediaPurpose) {
    const peer = this.peers[purpose];
    this.peers[purpose] = null;
    peer?.stopStats();
    peer?.connection.close();
  }

  /** The receiving connection's transceiver on `mid`. */
  private transceiver(mid: string): RTCRtpTransceiver | undefined {
    return this.peers.receiving?.connection.getTransceivers().find((candidate) => candidate.mid === mid);
  }

  /**
   * The sending connection, ready for a new negotiation: an offer the media server never
   * answered, because the instance refused the share, is rolled back first.
   */
  private async settled(): Promise<RTCPeerConnection> {
    const connection = this.peer("sending");
    if (connection.signalingState === "have-local-offer") await connection.setLocalDescription({ type: "rollback" });
    return connection;
  }

  private peer(purpose: MediaPurpose): RTCPeerConnection {
    const peer = this.peers[purpose];
    if (!peer) throw new Error(`The ${purpose} connection is not made yet`);
    return peer.connection;
  }
}

/**
 * Offers only the first of the plan's codecs this browser has, since the media server
 * picks its own favourite among several: on a Chromium screen share at one quality,
 * H.264 high when the browser encodes it in hardware; otherwise H.264 baseline, in
 * hardware on Chrome on Windows; or the software codec on a browser with neither. A
 * browser that refuses the list is left to its own order, so the share still starts.
 */
async function preferCodecs(transceiver: RTCRtpTransceiver, plan: EncodingPlan) {
  const capabilities = RTCRtpSender.getCapabilities("video")?.codecs ?? [];
  const inHardware = await codecsInHardware(plan, capabilities);
  const codecs = codecPreferences(plan.codecs, capabilities, inHardware);
  if (codecs.length === 0 || !("setCodecPreferences" in transceiver)) return;
  try {
    transceiver.setCodecPreferences(codecs);
  } catch {
    // Left to the browser's own order.
  }
}

/** How long the browser has to say whether it encodes a codec in hardware before the answer counts as no. */
const HARDWARE_QUERY_MS = 1000;

/**
 * Which of the plan's codecs that are offered only in hardware (H.264 high) this browser
 * lists and says it encodes power-efficiently. A browser without the check, or whose check
 * throws, takes too long or says no, has none of them, and goes on to the next codec.
 * Chrome lists high, and main, even with no hardware encoder for them, hence the check.
 */
async function codecsInHardware(plan: EncodingPlan, capabilities: readonly RTCRtpCodec[]): Promise<Codec[]> {
  const found: Codec[] = [];
  for (const codec of plan.codecs) {
    const query = hardwareQuery(codec, plan);
    if (!query || !lists(codec, capabilities) || !navigator.mediaCapabilities?.encodingInfo) continue;
    const answer = await Promise.race([
      navigator.mediaCapabilities.encodingInfo(query).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), HARDWARE_QUERY_MS)),
    ]);
    if (answer?.supported && answer.powerEfficient) found.push(codec);
  }
  return found;
}

/**
 * Puts what the browser captured in the page's log, and each track it later ends, mutes
 * or unmutes by itself. Never a track's label: a window's title may say anything.
 */
function watchTracks(kind: Capture["kind"], stream: MediaStream) {
  for (const track of stream.getTracks()) {
    const { width, height, frameRate, displaySurface } = track.getSettings() as MediaTrackSettings & { displaySurface?: string };
    tabLog.info("capture.track", { kind, track: track.kind, width, height, frameRate, displaySurface });
    track.addEventListener("ended", () => tabLog.info("capture.track-ended", { kind, track: track.kind }));
    track.addEventListener("mute", () => tabLog.warn("capture.muted", { kind, track: track.kind }));
    track.addEventListener("unmute", () => tabLog.info("capture.unmuted", { kind, track: track.kind }));
  }
}

/**
 * Settles when the browser ends the capture's picture by itself: its "stop sharing" bar,
 * the shared tab or window closing, or the camera going away. A track graeae stops itself
 * fires no "ended", so this never settles for an ordinary stop.
 */
function endedOf(stream: MediaStream): Promise<void> {
  const [video] = stream.getVideoTracks();
  return new Promise((resolve) => video?.addEventListener("ended", () => resolve(), { once: true }));
}
