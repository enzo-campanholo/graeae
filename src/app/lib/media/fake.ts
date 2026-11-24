// The fake media client, for Seam 2: it captures nothing and connects nothing, so a
// share has no picture and the browser asks for no camera and opens no picker. It still
// holds a sending and a receiving connection as the real one does (ADR 0005), makes a
// stand-in offer on the sending one, with a new mid for each track as a real connection
// would, and answers the media server's offers for the shares it watches on the
// receiving one, so the page goes through every step the real client does. Its offers
// and answers are the size a real tab's are, and grow with each share it sends or
// watches as theirs do.
//
// A Seam 2 journey steers it through `window.graeaeFakeMedia` (`FakeMediaControl`): the
// browser family, whether a Chromium screen share goes out at two qualities, what the
// browser's picker returns, the browser ending a screen share by itself, the quality the
// shares it watches arrive at, the statistics of the shares it
// sends, which go through the same rule as the real client's, each connection's health,
// and the bytes its receiving connection has received for the usage count, and how often
// the tab reports them. It is in a build for Seam 2 only.

import { encodingPlan, TWO_QUALITIES, type EncodingPlan, type QualityName } from "../../../shared/encoding.ts";
import type { IceServer, MediaPurpose } from "../../../shared/socket/index.ts";
import { USAGE_REPORT_EVERY_MS } from "../../../shared/socket/usage.ts";
import { screenCapture, type BrowserFamily } from "./capture.ts";
import type { Capture, MediaClient, MediaHealth, Offer } from "./client.ts";
import type { FakeMediaControl } from "./fake-control.ts";
import type { TransportTotals } from "./transport.ts";
import { follow, NotesBoard, readingOf, STEP_DOWN, type SharerNotes } from "./sending.ts";

export type { FakeMediaControl, FakePick } from "./fake-control.ts";

declare global {
  interface Window {
    graeaeFakeMedia?: Partial<FakeMediaControl>;
  }
}

/** Whoever listens for the quality the watched shares arrive at. */
const listeners = new Set<(quality: QualityName) => void>();

/** Where a journey's statistics of each live share go. */
const reading = new Map<Capture["kind"], ReturnType<typeof follow>>();

/** Who hears how each connection is doing: nobody while it is not made. */
const health: Record<MediaPurpose, (health: MediaHealth) => void> = { sending: () => undefined, receiving: () => undefined };

/** The control, made on first use from whatever a journey set before the page loaded. */
function control(): FakeMediaControl {
  const preset = window.graeaeFakeMedia ?? {};
  if (!("endScreen" in preset)) {
    const made: FakeMediaControl = {
      browser: "chromium",
      twoQualities: TWO_QUALITIES,
      stepDown: STEP_DOWN,
      picker: { surface: "tab", audio: true },
      asked: [],
      screenAudio: null,
      endScreen: () => undefined,
      falter: (connection) => health[connection]("faltering"),
      fail: (connection) => health[connection]("failed"),
      recover: (connection) => health[connection]("fine"),
      connections: { sending: 0, receiving: 0 },
      iceServers: { sending: null, receiving: null },
      restarts: 0,
      replacements: 0,
      restartFails: false,
      received: "1080p",
      bytes: 0,
      relayed: false,
      reportEvery: USAGE_REPORT_EVERY_MS,
      receive: (quality) => {
        made.received = quality;
        for (const heard of listeners) heard(quality);
      },
      stats: (kind, entries, at) => reading.get(kind)?.(readingOf(entries, at)),
      sent: {},
      offers: 0,
      ...preset,
    };
    window.graeaeFakeMedia = made;
  }
  return window.graeaeFakeMedia as FakeMediaControl;
}

/** A capture the fake holds: its kind, and how to end it as the browser would. */
interface FakeCapture extends Capture {
  end: () => void;
}

export class FakeMediaClient implements MediaClient {
  /** The next mid an offer on the sending connection takes. */
  private nextMid = 0;
  private readonly connected: Record<MediaPurpose, boolean> = { sending: false, receiving: false };
  /** The capture of the last offer, followed once it is accepted. */
  private offered: Capture | null = null;
  /** The notes on each live share, for its sharer. */
  private readonly board = new NotesBoard<Capture>();
  /** Mids the media server gave the shares this tab watches, on the receiving connection. */
  private readonly pulled = new Set<string>();

  constructor() {
    control();
  }

  get browser(): BrowserFamily {
    return control().browser;
  }

  plan(kind: Capture["kind"]): EncodingPlan {
    return encodingPlan(this.browser, kind, { twoQualities: control().twoQualities });
  }

  async captureWebcam(): Promise<Capture> {
    return capture("webcam", false);
  }

  async captureScreen(): Promise<Capture | null> {
    const fake = control();
    const request = screenCapture(fake.browser);
    fake.asked.push(request);
    const pick = fake.picker;
    if (pick === "cancel") return null;
    // Sound comes only when it was asked for and the picker gave some.
    const screen = capture("screen", request.audio !== false && pick.audio);
    fake.screenAudio = screen.audio ? true : null;
    fake.endScreen = () => screen.end();
    return screen;
  }

  connect(connection: MediaPurpose, iceServers: IceServer[], heard: (health: MediaHealth) => void) {
    this.reset(connection);
    this.connected[connection] = true;
    health[connection] = heard;
    const fake = control();
    fake.connections = { ...fake.connections, [connection]: fake.connections[connection] + 1 };
    fake.iceServers = { ...fake.iceServers, [connection]: iceServers };
  }

  replace(iceServers: IceServer[], heard: (health: MediaHealth) => void) {
    this.connect("receiving", iceServers, heard);
    const fake = control();
    fake.replacements += 1;
    // A new connection's transport counts from zero.
    fake.bytes = 0;
  }

  retire() {}

  reset(connection: MediaPurpose) {
    this.connected[connection] = false;
    const fake = control();
    fake.iceServers = { ...fake.iceServers, [connection]: null };
    health[connection] = () => undefined;
    if (connection === "receiving") {
      this.pulled.clear();
      return;
    }
    this.nextMid = 0;
    for (const kind of [...reading.keys()]) this.unfollow(kind);
    this.offered = null;
  }

  renew(connection: MediaPurpose, iceServers: IceServer[]) {
    const fake = control();
    if (this.connected[connection]) fake.iceServers = { ...fake.iceServers, [connection]: iceServers };
  }

  async relayed(connection: MediaPurpose): Promise<boolean> {
    return this.connected[connection] && control().relayed;
  }

  async restart(iceServers: IceServer[]): Promise<{ sdp: string; mid: string }> {
    if (!this.connected.sending) throw new Error("The sending connection is not made yet");
    const fake = control();
    fake.iceServers = { ...fake.iceServers, sending: iceServers };
    fake.restarts += 1;
    const mid = this.mid();
    return { sdp: this.standIn("a stand-in offer restarting ICE", this.nextMid), mid };
  }

  async abandonRestart() {}

  async restarted(answer: string) {
    void answer;
    if (control().restartFails) throw new Error("The fake was told the restart fails");
    // As a real connection's state goes back to "connected"; one already fine hears nothing new.
    health.sending("fine");
  }

  async offer(capture: Capture): Promise<Offer> {
    control().offers += 1;
    this.offered = capture;
    const video = this.mid();
    const audio = capture.audio ? this.mid() : undefined;
    return { sdp: this.standIn(`a stand-in offer for a ${capture.kind}`, this.nextMid), video, ...(audio === undefined ? {} : { audio }) };
  }

  async accept(answer: string) {
    void answer;
    const capture = this.offered;
    this.offered = null;
    if (!capture) return;
    // Its statistics come from the journey, at times counted from the share's start.
    const sending = follow(
      this.plan(capture.kind),
      undefined,
      0,
      {
        apply: (encodings, degradation) => {
          control().sent = { ...control().sent, [capture.kind]: { encodings, degradation } };
        },
        notes: (notes) => this.board.tell(capture, notes),
      },
      { stepDown: control().stepDown },
    );
    reading.set(capture.kind, sending);
  }

  notes(capture: Capture, heard: (notes: SharerNotes) => void): () => void {
    return this.board.listen(capture, heard);
  }

  /** The live share of `kind` is no longer sent. */
  private unfollow(kind: Capture["kind"]) {
    reading.delete(kind);
    const { [kind]: gone, ...sent } = control().sent;
    void gone;
    control().sent = sent;
  }

  async pull(offer: string, video: string, audio?: string) {
    void offer;
    this.pulled.add(video);
    if (audio !== undefined) this.pulled.add(audio);
    const sections = Math.max(...[...this.pulled].map(Number)) + 1;
    return { answer: this.standIn("a stand-in answer", sections), stream: null };
  }

  received(video: string, heard: (quality: QualityName | null) => void): () => void {
    void video;
    heard(control().received);
    listeners.add(heard);
    return () => listeners.delete(heard);
  }

  async transport(): Promise<TransportTotals | null> {
    return this.connected.receiving ? { received: control().bytes, relayed: control().relayed } : null;
  }

  get reportEvery(): number {
    return control().reportEvery;
  }

  drop(video: string) {
    void video;
  }

  setAudio(capture: Capture, on: boolean) {
    if (capture.kind === "screen" && capture.audio) control().screenAudio = on;
  }

  stop(capture: Capture) {
    if (capture.kind === "screen") control().screenAudio = null;
    this.unfollow(capture.kind);
    this.board.forget(capture);
  }

  close() {
    this.reset("sending");
    this.reset("receiving");
  }

  /** The lowest mid the sending connection's offers have not used. */
  private mid(): string {
    return String(this.nextMid++);
  }

  /**
   * A stand-in SDP the size a real one is: a media section for each of the connection's
   * `sections`, since a section stays on it once its share or pull ends. So it grows as a
   * real tab's does, some 2,340 bytes a screen share with sound watched (ticket 56).
   */
  private standIn(what: string, sections: number): string {
    let sdp = `v=0\r\ns=${what}\r\n`;
    for (let mid = 0; mid < sections; mid++) sdp += standInSection(mid);
    return sdp;
  }
}

/** The size of one media section of a real tab's SDP: Chromium's on Windows, read in ticket 56. */
const SECTION_BYTES = 1_170;

/** One media section of a stand-in SDP: short lines ending in CRLF, as a real one's. */
function standInSection(mid: number): string {
  let section = `m=video 9 UDP/TLS/RTP/SAVPF 96\r\na=mid:${mid}\r\n`;
  for (let line = 0; section.length < SECTION_BYTES; line++) section += `a=x-stand-in:${line} as long as a real line\r\n`;
  return section;
}

function capture(kind: Capture["kind"], audio: boolean): FakeCapture {
  let end = () => undefined as void;
  const ended = new Promise<void>((resolve) => (end = resolve));
  return { kind, stream: null, audio, ended, end };
}
