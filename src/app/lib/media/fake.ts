// The fake media client, for Seam 2: it captures nothing and connects nothing, so a
// share has no picture and the browser asks for no camera and opens no picker. It still
// makes a stand-in offer, with a new mid for each track as a real connection would, and
// answers the media server's offers for the shares it watches, so the page goes through
// every step the real client does.
//
// A Seam 2 journey steers it through `window.graeaeFakeMedia` (`FakeMediaControl`): the
// browser family, what the browser's picker returns, and the browser ending a screen
// share by itself. It is in a build for Seam 2 only.

import type { IceServer } from "../../../shared/socket/index.ts";
import { screenCapture, type BrowserFamily } from "./capture.ts";
import type { Capture, MediaClient, Offer } from "./client.ts";
import type { FakeMediaControl } from "./fake-control.ts";

export type { FakeMediaControl, FakePick } from "./fake-control.ts";

declare global {
  interface Window {
    graeaeFakeMedia?: Partial<FakeMediaControl>;
  }
}

/** The control, made on first use from whatever a journey set before the page loaded. */
function control(): FakeMediaControl {
  const preset = window.graeaeFakeMedia ?? {};
  if (!("endScreen" in preset)) {
    window.graeaeFakeMedia = {
      browser: "chromium",
      picker: { surface: "tab", audio: true },
      asked: [],
      screenAudio: null,
      endScreen: () => undefined,
      ...preset,
    };
  }
  return window.graeaeFakeMedia as FakeMediaControl;
}

/** A capture the fake holds: its kind, and how to end it as the browser would. */
interface FakeCapture extends Capture {
  end: () => void;
}

export class FakeMediaClient implements MediaClient {
  private nextMid = 0;
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

  connect(iceServers: IceServer[]) {
    void iceServers;
  }

  async offer(capture: Capture): Promise<Offer> {
    const video = this.mid();
    const audio = capture.audio ? this.mid() : undefined;
    return { sdp: `v=0 a stand-in offer for a ${capture.kind}`, video, ...(audio === undefined ? {} : { audio }) };
  }

  async accept(answer: string) {
    void answer;
  }

  async pull(offer: string, video: string, audio?: string) {
    void offer;
    this.pulled.add(video);
    if (audio !== undefined) this.pulled.add(audio);
    return { answer: "v=0 a stand-in answer", stream: null };
  }

  drop(video: string) {
    void video;
  }

  setAudio(capture: Capture, on: boolean) {
    if (capture.kind === "screen" && capture.audio) control().screenAudio = on;
  }

  stop(capture: Capture) {
    if (capture.kind === "screen") control().screenAudio = null;
  }

  close() {}

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
