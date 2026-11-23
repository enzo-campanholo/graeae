// The stand-in media server: a plain RTCPeerConnection in the same page that answers the
// tab's offers and makes the offers of its watches the way Cloudflare's media server does,
// as far as `docs/media-server.md` records it. What it cannot stand in for is listed there
// too (a rebuilt transport the real one never connects shows here as a changed ufrag).

/** The ICE ufrag a description carries, or null for a description with none. */
export function ufragOf(sdp: string): string | null {
  return sdp.match(/^a=ice-ufrag:(\S+)/m)?.[1] ?? null;
}

/** The direction a description gives the section of `mid`. */
export function directionOf(sdp: string, mid: string): string | null {
  const section = sdp.split(/\r?\nm=/).find((one) => new RegExp(`^a=mid:${mid}\\r?$`, "m").test(one));
  return section?.match(/^a=(sendonly|recvonly|sendrecv|inactive)\r?$/m)?.[1] ?? null;
}

/** How many media sections of a description are not rejected (port 0). */
export function liveSections(sdp: string): number {
  return (sdp.match(/^m=\w+ [1-9]/gm) ?? []).length;
}

export class StandInMediaServer {
  private readonly peer = new RTCPeerConnection({ bundlePolicy: "max-bundle" });
  /** The mids of the sections a watch is on, so a closed one is reused and a live one is not. */
  private readonly pulling = new Set<string>();

  /** Answers a tab's offer: a share, or a restart. */
  async answer(offer: string): Promise<string> {
    await this.peer.setRemoteDescription({ type: "offer", sdp: offer });
    await this.peer.setLocalDescription(await this.peer.createAnswer());
    await gathered(this.peer);
    return this.peer.localDescription!.sdp;
  }

  /**
   * Offers the tab a watch of `track`. Like the media server, it puts the watch on a
   * section the tab's own offers left inactive, the lowest mid first, and makes a new one
   * only when there is none.
   */
  async pull(track: MediaStreamTrack): Promise<{ offer: string; mid: string }> {
    const reused = this.peer
      .getTransceivers()
      .filter((one) => one.mid !== null && !this.pulling.has(one.mid))
      .filter((one) => one.currentDirection === "inactive" && one.receiver.track.kind === track.kind)
      .sort((a, b) => Number(a.mid) - Number(b.mid))[0];
    const transceiver = reused ?? this.peer.addTransceiver(track, { direction: "sendonly" });
    if (reused) {
      await reused.sender.replaceTrack(track);
      reused.direction = "sendonly";
    }
    await this.peer.setLocalDescription(await this.peer.createOffer());
    await gathered(this.peer);
    const mid = transceiver.mid!;
    this.pulling.add(mid);
    return { offer: this.peer.localDescription!.sdp, mid };
  }

  /** Takes the tab's answer to a watch. */
  async pulled(answer: string) {
    await this.peer.setRemoteDescription({ type: "answer", sdp: answer });
  }

  /** Ends the watch on `mid`, as the media server closes a track: no negotiation until the next. */
  async unpull(mid: string) {
    const transceiver = this.peer.getTransceivers().find((one) => one.mid === mid);
    await transceiver?.sender.replaceTrack(null);
    if (transceiver) transceiver.direction = "inactive";
    this.pulling.delete(mid);
  }

  /** Whether the picture the tab sends on `mid` decodes here within `ms`. */
  async decodes(mid: string, ms = 5000): Promise<boolean> {
    const receiver = this.peer.getTransceivers().find((one) => one.mid === mid)?.receiver;
    for (const until = performance.now() + ms; receiver && performance.now() < until; ) {
      for (const report of (await receiver.getStats()).values()) {
        if (report.type === "inbound-rtp" && report.framesDecoded > 0) return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  }

  close() {
    this.peer.close();
  }
}

function gathered(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (peer.iceGatheringState !== "complete") return;
      peer.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    peer.addEventListener("icegatheringstatechange", check);
  });
}
