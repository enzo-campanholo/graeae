// The real media client: the webcam through `getUserMedia`, a screen and its screen audio
// through `getDisplayMedia`, and the tab's one media connection to the media server as
// one `RTCPeerConnection`, which sends what the tab shares and receives what it watches.
//
// No test reaches this file: Seam 2 runs on the fake. It is kept thin enough to read
// against the spec's Screen audio, Encoding and quality and Relay sections; what a screen
// capture asks for, the encoding plan, how the browser's API takes it, and what a live
// share sends on a weak upload with the notes its sharer sees are pure rules in
// `capture.ts`, `src/shared/encoding.ts`, `encodings.ts` and `sending.ts`, which are
// tested. The
// owner's real-media pass (tickets 13 and 27) proves it on a deployed instance.

import { encodingPlan, type EncodingPlan, type QualityName } from "../../../shared/encoding.ts";
import type { IceServer } from "../../../shared/socket/index.ts";
import { USAGE_REPORT_EVERY_MS } from "../../../shared/socket/usage.ts";
import { browserFamily, screenCapture, stereoOpus, type BrowserFamily } from "./capture.ts";
import type { Capture, MediaClient, MediaHealth, Offer } from "./client.ts";
import { codecPreferences, receivedQuality, sendEncodings } from "./encodings.ts";
import { follow, NotesBoard, READ_EVERY_MS, readingOf, type Degradation, type SharerNotes } from "./sending.ts";
import { transportTotals, type StatsEntry, type TransportTotals } from "./transport.ts";
import { pairSummary, STATS_EVERY_MS, streamSummaries, type Counted } from "./stats.ts";
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

export class BrowserMediaClient implements MediaClient {
  readonly browser: BrowserFamily = browserFamily(navigator.userAgent);
  readonly reportEvery = USAGE_REPORT_EVERY_MS;
  private connection: RTCPeerConnection | null = null;
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
  /** Stops the media connection's statistics going in the page's log, while they do. */
  private stopStats: (() => void) | null = null;

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
    // A game moves: the encoder treats the picture as motion rather than a still document,
    // and gives up resolution before frame rate.
    for (const track of stream.getVideoTracks()) track.contentHint = "motion";
    // Any audio the picker gave is sent, whatever the system: it is the member's choice.
    return { kind: "screen", stream, audio: stream.getAudioTracks().length > 0, ended: endedOf(stream) };
  }

  connect(iceServers: IceServer[], health: (health: MediaHealth) => void) {
    // The relay is offered from the start, over UDP, TCP and TLS, in `iceServers`; the
    // browser uses a direct path whenever one works.
    const connection = new RTCPeerConnection({ iceServers, bundlePolicy: "max-bundle" });
    this.connection = connection;
    // "disconnected" is the browser losing its path and looking for another by itself;
    // "failed" is it giving up, which the room client answers with a restart.
    let was: MediaHealth = "fine";
    connection.addEventListener("connectionstatechange", () => {
      if (connection !== this.connection) return;
      const state = connection.connectionState;
      (state === "failed" || state === "disconnected" ? tabLog.warn : tabLog.info).call(tabLog, "pc.connection", { state });
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
        tabLog.info("pc.pair", { ...now });
      }
    };
    connection.addEventListener("iceconnectionstatechange", () => {
      const state = connection.iceConnectionState;
      (state === "failed" || state === "disconnected" ? tabLog.warn : tabLog.info).call(tabLog, "pc.ice", { state });
      if (state === "connected" || state === "completed") void logPair();
    });
    connection.addEventListener("icegatheringstatechange", () => tabLog.info("pc.gathering", { state: connection.iceGatheringState }));
    connection.addEventListener("signalingstatechange", () => tabLog.info("pc.signaling", { state: connection.signalingState }));
    // A summary of every stream every 15 seconds, while there is any.
    const counted: Counted = new Map();
    this.stopStats?.();
    this.stopStats = every(STATS_EVERY_MS, () => {
      if (connection !== this.connection) return;
      void connection
        .getStats()
        .then((stats) => {
          for (const summary of streamSummaries(stats.values() as Iterable<StatsEntry>, counted)) tabLog.info("stats", { ...summary });
          return logPair();
        })
        .catch(() => undefined);
    });
  }

  renew(iceServers: IceServer[]) {
    const connection = this.connection;
    if (!connection || connection.signalingState === "closed") return;
    try {
      // Used the next time the browser gathers candidates; the path in use is left alone.
      connection.setConfiguration({ ...connection.getConfiguration(), iceServers });
    } catch {
      // A browser that refuses keeps its credential until it runs out, an hour later.
    }
  }

  async restart(iceServers: IceServer[]): Promise<{ sdp: string; mid: string }> {
    this.renew(iceServers);
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
    const connection = this.connection;
    if (!connection || connection.signalingState !== "have-local-offer") return;
    await connection.setLocalDescription({ type: "rollback" });
    // Never negotiated, it would otherwise go out with the next offer.
    this.spare?.stop();
    this.spare = null;
  }

  async restarted(answer: string) {
    const connection = this.peer();
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
    preferCodecs(videoSender, plan);
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
    await this.peer().setRemoteDescription({ type: "answer", sdp: stereoOpus(answer) });
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
    const connection = await this.settled();
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
    const stats = await this.connection?.getStats().catch(() => null);
    return stats ? transportTotals(stats.values() as Iterable<StatsEntry>) : null;
  }

  drop(video: string) {
    // The media server has closed the pull, so nothing arrives on it. Its transceivers
    // stay on the connection until the media server's next offer settles them.
    void video;
  }

  setAudio(capture: Capture, on: boolean) {
    // A disabled track sends silence: the share stays live, with no sound.
    for (const track of capture.stream?.getAudioTracks() ?? []) track.enabled = on;
  }

  stop(capture: Capture) {
    this.unfollow(capture);
    for (const track of capture.stream?.getTracks() ?? []) track.stop();
    for (const transceiver of this.sending.get(capture) ?? []) {
      if (this.connection?.signalingState === "closed") break;
      void transceiver.sender.replaceTrack(null);
      // Takes effect with the next offer; the media server has force-closed it already.
      transceiver.direction = "inactive";
    }
    this.sending.delete(capture);
  }

  close() {
    for (const capture of [...this.sending.keys()]) this.stop(capture);
    this.reset();
  }

  reset() {
    this.stopStats?.();
    this.stopStats = null;
    for (const capture of [...this.following.keys()]) this.unfollow(capture);
    this.connection?.close();
    this.connection = null;
    this.spare = null;
    this.sending.clear();
    this.offered = null;
  }

  private transceiver(mid: string): RTCRtpTransceiver | undefined {
    return this.connection?.getTransceivers().find((candidate) => candidate.mid === mid);
  }

  /**
   * The media connection, ready for a new negotiation: an offer the media server never
   * answered, because the instance refused the share, is rolled back first.
   */
  private async settled(): Promise<RTCPeerConnection> {
    const connection = this.peer();
    if (connection.signalingState === "have-local-offer") await connection.setLocalDescription({ type: "rollback" });
    return connection;
  }

  private peer(): RTCPeerConnection {
    if (!this.connection) throw new Error("The media connection is not made yet");
    return this.connection;
  }
}

/**
 * Offers only the first of the plan's codecs this browser has: hardware H.264 baseline,
 * or the software codec on a browser without it, since the media server picks its own
 * favourite among several. A browser that refuses the list is left to its own order, so
 * the share still starts.
 */
function preferCodecs(transceiver: RTCRtpTransceiver, plan: EncodingPlan) {
  const codecs = codecPreferences(plan.codecs, RTCRtpSender.getCapabilities("video")?.codecs ?? []);
  if (codecs.length === 0 || !("setCodecPreferences" in transceiver)) return;
  try {
    transceiver.setCodecPreferences(codecs);
  } catch {
    // Left to the browser's own order.
  }
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
