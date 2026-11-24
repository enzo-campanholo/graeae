// The stand-in media server: two plain RTCPeerConnections in the same page, one for each
// of the tab's media connections (ADR 0005). One answers the tab's offers on its sending
// connection; the other makes the offers of its watches on its receiving connection.
// Which of the media server's behaviours it plays, and how it differs, is recorded beside
// each behaviour in `docs/media-server.md`, and only there.

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
  /** The media server's end of the tab's sending connection. */
  private readonly sending = new RTCPeerConnection({ bundlePolicy: "max-bundle" });
  /** The media server's end of the tab's receiving connection. */
  private readonly receiving = new RTCPeerConnection({ bundlePolicy: "max-bundle" });
  /** The mids of the receiving connection's sections a watch is on, so a closed one is reused and a live one is not. */
  private readonly pulling = new Set<string>();

  /** Answers a tab's offer on its sending connection: a share, or a restart. */
  async answer(offer: string): Promise<string> {
    await this.sending.setRemoteDescription({ type: "offer", sdp: offer });
    await this.sending.setLocalDescription(await this.sending.createAnswer());
    await gathered(this.sending);
    return this.sending.localDescription!.sdp;
  }

  /**
   * Offers the tab a watch of `track` on its receiving connection. Like the media server,
   * it puts the watch on a section a closed watch left inactive, the lowest mid first,
   * and makes a new one only when there is none. Nothing renegotiates the receiving
   * connection between watches, so this offer is the first to say the closed one ended.
   */
  async pull(track: MediaStreamTrack): Promise<{ offer: string; mid: string }> {
    const reused = this.receiving
      .getTransceivers()
      .filter((one) => one.mid !== null && !this.pulling.has(one.mid))
      .filter((one) => one.direction === "inactive" && one.receiver.track.kind === track.kind)
      .sort((a, b) => Number(a.mid) - Number(b.mid))[0];
    const transceiver = reused ?? this.receiving.addTransceiver(track, { direction: "sendonly" });
    if (reused) {
      await reused.sender.replaceTrack(track);
      reused.direction = "sendonly";
    }
    await this.receiving.setLocalDescription(await this.receiving.createOffer());
    await gathered(this.receiving);
    const mid = transceiver.mid!;
    this.pulling.add(mid);
    return { offer: this.receiving.localDescription!.sdp, mid };
  }

  /** Takes the tab's answer to a watch. */
  async pulled(answer: string) {
    await this.receiving.setRemoteDescription({ type: "answer", sdp: answer });
  }

  /** Ends the watch on `mid`, as the media server closes a track: no negotiation until the next. */
  async unpull(mid: string) {
    const transceiver = this.receiving.getTransceivers().find((one) => one.mid === mid);
    await transceiver?.sender.replaceTrack(null);
    if (transceiver) transceiver.direction = "inactive";
    this.pulling.delete(mid);
  }

  /** Whether the picture the tab sends on `mid` of its sending connection decodes here within `ms`. */
  async decodes(mid: string, ms = 5000): Promise<boolean> {
    const receiver = this.sending.getTransceivers().find((one) => one.mid === mid)?.receiver;
    for (const until = performance.now() + ms; receiver && performance.now() < until; ) {
      for (const report of (await receiver.getStats()).values()) {
        if (report.type === "inbound-rtp" && report.framesDecoded > 0) return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  }

  close() {
    this.sending.close();
    this.receiving.close();
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
