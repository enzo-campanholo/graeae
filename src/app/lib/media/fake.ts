// The fake media client, for Seam 2: it captures nothing and connects nothing, so a
// share has no picture and the browser asks for no camera and opens no picker. It still
// makes a stand-in offer, with a new mid for each track as a real connection would, and
// answers the media server's offers for the shares it watches, so the page goes through
// every step the real client does.
//
// A Seam 2 journey steers it through `window.graeaeFakeMedia` (`FakeMediaControl`): the
// browser family, what the browser's picker returns, the browser ending a screen share
// by itself, the quality the shares it watches arrive at, the statistics of the shares it
// sends, which go through the same rule as the real client's, and the bytes its media
// connection has received for the usage count. It is in a build for Seam 2 only.

import { encodingPlan, type QualityName } from "../../../shared/encoding.ts";
import type { IceServer } from "../../../shared/socket/index.ts";
import { screenCapture, type BrowserFamily } from "./capture.ts";
import type { Capture, MediaClient, Offer } from "./client.ts";
import type { FakeMediaControl } from "./fake-control.ts";
import type { TransportTotals } from "./transport.ts";
import { follow, NotesBoard, readingOf, type SharerNotes } from "./sending.ts";

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

/** The control, made on first use from whatever a journey set before the page loaded. */
function control(): FakeMediaControl {
  const preset = window.graeaeFakeMedia ?? {};
  if (!("endScreen" in preset)) {
    const made: FakeMediaControl = {
      browser: "chromium",
      picker: { surface: "tab", audio: true },
      asked: [],
      screenAudio: null,
      endScreen: () => undefined,
      falter: () => undefined,
      recover: () => undefined,
      connections: 0,
      received: "1080p",
      bytes: 0,
      relayed: false,
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
  private nextMid = 0;
  private connected = false;
  /** The capture of the last offer, followed once it is accepted. */
  private offered: Capture | null = null;
  /** The notes on each live share, for its sharer. */
  private readonly board = new NotesBoard<Capture>();
  /** Mids the media server gave the shares this tab watches, which an offer of ours never takes. */
  private readonly pulled = new Set<string>();

  constructor() {
    control();
  }

  get browser(): BrowserFamily {
    return control().browser;
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

  connect(iceServers: IceServer[], faltering: (faltering: boolean) => void) {
    void iceServers;
    this.connected = true;
    const fake = control();
    fake.connections += 1;
    fake.falter = () => faltering(true);
    fake.recover = () => faltering(false);
  }

  reset() {
    this.connected = false;
    const fake = control();
    fake.falter = () => undefined;
    fake.recover = () => undefined;
    this.nextMid = 0;
    this.pulled.clear();
    for (const kind of [...reading.keys()]) this.unfollow(kind);
    this.offered = null;
  }

  async offer(capture: Capture): Promise<Offer> {
    control().offers += 1;
    this.offered = capture;
    const video = this.mid();
    const audio = capture.audio ? this.mid() : undefined;
    return { sdp: `v=0 a stand-in offer for a ${capture.kind}`, video, ...(audio === undefined ? {} : { audio }) };
  }

  async accept(answer: string) {
    void answer;
    const capture = this.offered;
    this.offered = null;
    if (!capture) return;
    // Its statistics come from the journey, at times counted from the share's start.
    const sending = follow(encodingPlan(this.browser, capture.kind), undefined, 0, {
      apply: (encodings, degradation) => {
        control().sent = { ...control().sent, [capture.kind]: { encodings, degradation } };
      },
      notes: (notes) => this.board.tell(capture, notes),
    });
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
    return { answer: "v=0 a stand-in answer", stream: null };
  }

  received(video: string, heard: (quality: QualityName | null) => void): () => void {
    void video;
    heard(control().received);
    listeners.add(heard);
    return () => listeners.delete(heard);
  }

  async transport(): Promise<TransportTotals | null> {
    return this.connected ? { received: control().bytes, relayed: control().relayed } : null;
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
    this.connected = false;
    for (const kind of [...reading.keys()]) this.unfollow(kind);
  }

  /** The lowest mid this tab's offers have not used, and not given to a pull. */
  private mid(): string {
    while (this.pulled.has(String(this.nextMid))) this.nextMid++;
    return String(this.nextMid++);
  }
}

function capture(kind: Capture["kind"], audio: boolean): FakeCapture {
  let end = () => undefined as void;
  const ended = new Promise<void>((resolve) => (end = resolve));
  return { kind, stream: null, audio, ended, end };
}
