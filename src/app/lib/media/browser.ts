// The real media client: the webcam through `getUserMedia`, and the tab's one media
// connection to the media server as one `RTCPeerConnection`, which sends what the tab
// shares and receives what it watches.
//
// No test reaches this file: Seam 2 runs on the fake. It is kept thin enough to read
// against the spec's Encoding and quality and Relay sections. Ticket 13 proves it on a
// deployed instance; ticket 17 adds the codec order, and ticket 15 the screen.

import type { IceServer } from "../../../shared/socket/index.ts";
import type { Capture, MediaClient, Offer } from "./client.ts";

/** A webcam share: 720p at 30 fps, limited to 1.5 Mbps (spec, Encoding and quality). */
const WEBCAM = { width: 1280, height: 720, frameRate: 30, maxBitrate: 1_500_000 };

export class BrowserMediaClient implements MediaClient {
  private connection: RTCPeerConnection | null = null;
  /** The transceivers sending each capture, so stopping one stops its sending. */
  private readonly sending = new Map<Capture, RTCRtpTransceiver[]>();
  /** The transceivers of the last offer, whose limits are set once it is accepted. */
  private offered: RTCRtpTransceiver[] = [];

  async captureWebcam(): Promise<Capture> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: WEBCAM.width },
        height: { ideal: WEBCAM.height },
        frameRate: { ideal: WEBCAM.frameRate, max: WEBCAM.frameRate },
      },
      audio: false,
    });
    return { kind: "webcam", stream };
  }

  connect(iceServers: IceServer[]) {
    // The relay is offered from the start, over UDP, TCP and TLS, in `iceServers`; the
    // browser uses a direct path whenever one works.
    this.connection = new RTCPeerConnection({ iceServers, bundlePolicy: "max-bundle" });
  }

  async offer(capture: Capture): Promise<Offer> {
    const connection = await this.settled();
    const [video] = capture.stream?.getVideoTracks() ?? [];
    if (!video) throw new Error("The capture has no picture to send");
    const transceiver = connection.addTransceiver(video, {
      direction: "sendonly",
      streams: capture.stream ? [capture.stream] : [],
      sendEncodings: [{ maxBitrate: WEBCAM.maxBitrate, maxFramerate: WEBCAM.frameRate }],
    });
    this.sending.set(capture, [transceiver]);
    this.offered = [transceiver];
    await connection.setLocalDescription(await connection.createOffer());
    if (!transceiver.mid || !connection.localDescription) throw new Error("The offer gave the capture no mid");
    return { sdp: connection.localDescription.sdp, video: transceiver.mid };
  }

  async accept(answer: string) {
    await this.peer().setRemoteDescription({ type: "answer", sdp: answer });
    // Set again once negotiated, in case the browser let the limits go in the offer.
    for (const transceiver of this.offered.splice(0)) {
      const parameters = transceiver.sender.getParameters();
      const [encoding = {}] = parameters.encodings ?? [];
      parameters.encodings = [{ ...encoding, maxBitrate: WEBCAM.maxBitrate, maxFramerate: WEBCAM.frameRate }];
      await transceiver.sender.setParameters(parameters).catch(() => undefined);
    }
  }

  async pull(offer: string, video: string) {
    const connection = await this.settled();
    await connection.setRemoteDescription({ type: "offer", sdp: offer });
    const transceiver = connection.getTransceivers().find((candidate) => candidate.mid === video);
    if (!transceiver) throw new Error(`The media server's offer has no transceiver ${video}`);
    await connection.setLocalDescription(await connection.createAnswer());
    if (!connection.localDescription) throw new Error("The browser made no answer");
    return { answer: connection.localDescription.sdp, stream: new MediaStream([transceiver.receiver.track]) };
  }

  drop(video: string) {
    // The media server has closed the pull, so nothing arrives on it. Its transceiver
    // stays on the connection until the media server's next offer settles it.
    void video;
  }

  stop(capture: Capture) {
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
    this.connection?.close();
    this.connection = null;
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
