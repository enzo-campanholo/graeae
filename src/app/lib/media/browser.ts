// The real media client: the webcam through `getUserMedia`, a screen and its screen audio
// through `getDisplayMedia`, and the tab's one media connection to the media server as
// one `RTCPeerConnection`, which sends what the tab shares and receives what it watches.
//
// No test reaches this file: Seam 2 runs on the fake. It is kept thin enough to read
// against the spec's Screen audio, Encoding and quality and Relay sections; what a screen
// capture asks for is the pure rule in `capture.ts`, which is tested. Ticket 13 proves it
// on a deployed instance; ticket 17 adds the codec order and the two qualities.

import type { IceServer } from "../../../shared/socket/index.ts";
import { browserFamily, screenCapture, stereoOpus, type BrowserFamily } from "./capture.ts";
import type { Capture, MediaClient, Offer } from "./client.ts";

/** A webcam share: 720p at 30 fps, limited to 1.5 Mbps (spec, Encoding and quality). */
const WEBCAM = { width: 1280, height: 720, frameRate: 30, maxBitrate: 1_500_000 };

/** A screen share's one quality until ticket 17: 60 fps, limited to 12 Mbps. */
const SCREEN = { frameRate: 60, maxBitrate: 12_000_000 };

export class BrowserMediaClient implements MediaClient {
  readonly browser: BrowserFamily = browserFamily(navigator.userAgent);
  private connection: RTCPeerConnection | null = null;
  /** The transceivers sending each capture, so stopping one stops its sending. */
  private readonly sending = new Map<Capture, RTCRtpTransceiver[]>();
  /** The video transceiver of the last offer and its limits, set again once it is accepted. */
  private offered: { transceiver: RTCRtpTransceiver; limits: RTCRtpEncodingParameters } | null = null;

  async captureWebcam(): Promise<Capture> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: WEBCAM.width },
        height: { ideal: WEBCAM.height },
        frameRate: { ideal: WEBCAM.frameRate, max: WEBCAM.frameRate },
      },
      audio: false,
    });
    return { kind: "webcam", stream, audio: false, ended: endedOf(stream) };
  }

  async captureScreen(): Promise<Capture | null> {
    let stream: MediaStream;
    try {
      // Chromium's picker hints are not in the DOM's types yet.
      stream = await navigator.mediaDevices.getDisplayMedia(screenCapture(this.browser) as DisplayMediaStreamOptions);
    } catch (error) {
      // The member closed the picker without picking, or said no: nothing to share.
      if (error instanceof DOMException && error.name === "NotAllowedError") return null;
      throw error;
    }
    // Any audio the picker gave is sent, whatever the system: it is the member's choice.
    return { kind: "screen", stream, audio: stream.getAudioTracks().length > 0, ended: endedOf(stream) };
  }

  connect(iceServers: IceServer[], faltering: (faltering: boolean) => void) {
    // The relay is offered from the start, over UDP, TCP and TLS, in `iceServers`; the
    // browser uses a direct path whenever one works.
    const connection = new RTCPeerConnection({ iceServers, bundlePolicy: "max-bundle" });
    this.connection = connection;
    // "disconnected" is the browser losing its path and looking for another by itself;
    // "failed" is it giving up. Either way the instance gives the shares 30 seconds.
    // No ICE restart is attempted: it would need a renegotiation the media server has not
    // been proven to take (ticket 22's note for the owner).
    let was = false;
    connection.addEventListener("connectionstatechange", () => {
      if (connection !== this.connection) return;
      const state = connection.connectionState;
      const now = state === "disconnected" || state === "failed" ? true : state === "connected" ? false : was;
      if (now !== was) faltering(now);
      was = now;
    });
  }

  async offer(capture: Capture): Promise<Offer> {
    const connection = await this.settled();
    const streams = capture.stream ? [capture.stream] : [];
    const [video] = capture.stream?.getVideoTracks() ?? [];
    const [audio] = capture.stream?.getAudioTracks() ?? [];
    if (!video) throw new Error("The capture has no picture to send");
    const limits = capture.kind === "screen" ? SCREEN : WEBCAM;
    const encoding = { maxBitrate: limits.maxBitrate, maxFramerate: limits.frameRate };
    const videoSender = connection.addTransceiver(video, { direction: "sendonly", streams, sendEncodings: [encoding] });
    // A screen share's sound goes with its picture, as one unit.
    const audioSender = audio ? connection.addTransceiver(audio, { direction: "sendonly", streams }) : null;
    this.sending.set(capture, audioSender ? [videoSender, audioSender] : [videoSender]);
    this.offered = { transceiver: videoSender, limits: encoding };
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
    // Set again once negotiated, in case the browser let the limits go in the offer.
    const offered = this.offered;
    this.offered = null;
    if (!offered) return;
    const parameters = offered.transceiver.sender.getParameters();
    const [encoding = {}] = parameters.encodings ?? [];
    parameters.encodings = [{ ...encoding, ...offered.limits }];
    await offered.transceiver.sender.setParameters(parameters).catch(() => undefined);
  }

  async pull(offer: string, video: string, audio?: string) {
    const connection = await this.settled();
    await connection.setRemoteDescription({ type: "offer", sdp: offer });
    const tracks = [video, ...(audio === undefined ? [] : [audio])].map((mid) => {
      const transceiver = connection.getTransceivers().find((candidate) => candidate.mid === mid);
      if (!transceiver) throw new Error(`The media server's offer has no transceiver ${mid}`);
      return transceiver.receiver.track;
    });
    const answer = await connection.createAnswer();
    await connection.setLocalDescription({ type: "answer", sdp: stereoOpus(answer.sdp ?? "") });
    if (!connection.localDescription) throw new Error("The browser made no answer");
    return { answer: connection.localDescription.sdp, stream: new MediaStream(tracks) };
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
    this.connection?.close();
    this.connection = null;
    this.sending.clear();
    this.offered = null;
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
 * Settles when the browser ends the capture's picture by itself: its "stop sharing" bar,
 * the shared tab or window closing, or the camera going away. A track graeae stops itself
 * fires no "ended", so this never settles for an ordinary stop.
 */
function endedOf(stream: MediaStream): Promise<void> {
  const [video] = stream.getVideoTracks();
  return new Promise((resolve) => video?.addEventListener("ended", () => resolve(), { once: true }));
}
