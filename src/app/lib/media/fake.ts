// The fake media client, for Seam 2: it captures nothing and connects nothing, so a
// share has no picture and the browser asks for no camera. It still makes a stand-in
// offer, with a new mid for each capture as a real connection would, and answers the
// media server's offers for the shares it watches, so the page goes through every step
// the real client does.

import type { IceServer } from "../../../shared/socket/index.ts";
import type { Capture, MediaClient, Offer } from "./client.ts";

export class FakeMediaClient implements MediaClient {
  private nextMid = 0;
  /** Mids the media server gave the shares this tab watches, which an offer of ours never takes. */
  private readonly pulled = new Set<string>();

  async captureWebcam(): Promise<Capture> {
    return { kind: "webcam", stream: null };
  }

  connect(iceServers: IceServer[]) {
    void iceServers;
  }

  async offer(capture: Capture): Promise<Offer> {
    while (this.pulled.has(String(this.nextMid))) this.nextMid++;
    const video = String(this.nextMid++);
    return { sdp: `v=0 a stand-in offer for a ${capture.kind}`, video };
  }

  async accept(answer: string) {
    void answer;
  }

  async pull(offer: string, video: string) {
    void offer;
    this.pulled.add(video);
    return { answer: "v=0 a stand-in answer", stream: null };
  }

  drop(video: string) {
    void video;
  }

  stop(capture: Capture) {
    void capture;
  }

  close() {}
}
