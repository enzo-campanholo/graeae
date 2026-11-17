// The fake media client, for Seam 2: it captures nothing and connects nothing, so a
// share has no picture and the browser asks for no camera. It still makes a stand-in
// offer, with a new mid for each capture as a real connection would, so the page goes
// through every step the real client does.

import type { IceServer } from "../../../shared/socket/index.ts";
import type { Capture, MediaClient, Offer } from "./client.ts";

export class FakeMediaClient implements MediaClient {
  private nextMid = 0;

  async captureWebcam(): Promise<Capture> {
    return { kind: "webcam", stream: null };
  }

  connect(iceServers: IceServer[]) {
    void iceServers;
  }

  async offer(capture: Capture): Promise<Offer> {
    const video = String(this.nextMid++);
    return { sdp: `v=0 a stand-in offer for a ${capture.kind}`, video };
  }

  async accept(answer: string) {
    void answer;
  }

  stop(capture: Capture) {
    void capture;
  }

  close() {}
}
