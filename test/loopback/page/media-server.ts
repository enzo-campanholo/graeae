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

/** A description's session part, then each media section, as lines without their ends. */
function sectionsOf(sdp: string): string[][] {
  return sdp
    .trimEnd()
    .split(/\r?\n(?=m=)/)
    .map((section) => section.split(/\r?\n/));
}

function joined(sections: string[][]): string {
  return sections.map((lines) => lines.join("\r\n")).join("\r\n") + "\r\n";
}

function midOf(section: string[]): string | null {
  for (const line of section) if (line.startsWith("a=mid:")) return line.slice("a=mid:".length);
  return null;
}

/** The payload types a media section lists on its m= line, in order. */
function payloadTypes(section: string[]): string[] {
  return section[0]?.match(/^m=\S+ \d+ \S+ (.*)$/)?.[1]?.trim().split(/\s+/) ?? [];
}

/** The payload type a codec line (rtpmap, fmtp or rtcp-fb) is about, or null for another line. */
function payloadTypeOf(line: string): string | null {
  return line.match(/^a=(?:rtpmap|fmtp|rtcp-fb):(\d+) /)?.[1] ?? null;
}

/** `section`'s codec lines for payload type `pt`. */
function codecLines(section: string[], pt: string): string[] {
  return section.filter((line) => payloadTypeOf(line) === pt);
}

/** The codec a payload type stands for in `section`: its rtpmap and fmtp, as "H264/90000 …". */
function codecOf(section: string[], pt: string): string | null {
  const name = section.find((line) => line.startsWith(`a=rtpmap:${pt} `))?.split(" ")[1];
  const fmtp = section.find((line) => line.startsWith(`a=fmtp:${pt} `))?.split(" ")[1] ?? "";
  return name ? `${name} ${fmtp}` : null;
}

/** The retransmission payload type `section` gives `pt`, if any. */
function rtxOf(section: string[], pt: string): string | undefined {
  return section.find((line) => new RegExp(`^a=fmtp:\\d+ apt=${pt}$`).test(line))?.match(/^a=fmtp:(\d+)/)?.[1];
}

/**
 * The payload types a watch here goes out on, best first, as the media server sent a
 * webcam's baseline H.264 (42001f, the encoding plan's) on ticket 58: on 42e01f's
 * whenever the tab's last offer listed one, and on any baseline H.264's otherwise.
 */
const SENT_AS = [/^profile-level-id=42e01f$/i, /^profile-level-id=42/i];

/** Whether `codec` (from `codecOf`) is baseline H.264 in packetization mode 1 that `profile` matches. */
function sentAs(codec: string, profile: RegExp): boolean {
  const [name, fmtp = ""] = codec.split(" ");
  const parameters = fmtp.split(";");
  return /^H264\/90000$/i.test(name ?? "") && parameters.includes("packetization-mode=1") && parameters.some((one) => profile.test(one));
}

export class StandInMediaServer {
  private readonly peer = new RTCPeerConnection({ bundlePolicy: "max-bundle" });
  /** The mids of the sections a watch is on, so a closed one is reused and a live one is not. */
  private readonly pulling = new Set<string>();
  /** The tab's last offer, the codecs the media server goes by. */
  private tabOffer: string[][] = [];
  /** For a watch sent on a payload type its section's answer does not list: the one it goes out on. */
  private readonly sendingOn = new Map<string, string>();

  /** Answers a tab's offer: a share, or a restart. */
  async answer(offer: string): Promise<string> {
    this.tabOffer = sectionsOf(offer);
    await this.peer.setRemoteDescription({ type: "offer", sdp: offer });
    await this.peer.setLocalDescription(await this.peer.createAnswer());
    await gathered(this.peer);
    return this.peer.localDescription!.sdp;
  }

  /**
   * Offers the tab a watch of `track`. Like the media server, it puts the watch on a
   * section the tab's own offers left inactive, the lowest mid first, and makes a new one
   * only when there is none.
   *
   * Its codecs are the media server's too (ticket 58). The watch goes out on a payload
   * type of the tab's last offer, from whichever section (`SENT_AS`). A new section
   * lists that payload type alone, with its retransmissions; a reused one lists what the
   * tab's last offer gave it, whether or not that holds the payload type the watch goes
   * out on.
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
    return { offer: this.withTheMediaServersCodecs(this.peer.localDescription!.sdp, mid), mid };
  }

  /** The payload type a watch goes out on, and the section of the tab's last offer that lists it, or null when none does. */
  private goingOutAs(): { section: string[]; pt: string } | null {
    for (const profile of SENT_AS) {
      for (const section of this.tabOffer.slice(1)) {
        const pt = payloadTypes(section).find((one) => sentAs(codecOf(section, one) ?? "", profile));
        if (pt) return { section, pt };
      }
    }
    return null;
  }

  /** `offer` with the section of `mid` listing the codecs the media server's offer would. */
  private withTheMediaServersCodecs(offer: string, mid: string): string {
    const sent = this.goingOutAs();
    if (!sent || kindOf(this.peer, mid) !== "video") return offer;
    const tabsOwn = this.tabOffer.find((section) => midOf(section) === mid);
    const rtx = rtxOf(sent.section, sent.pt);
    const listed = tabsOwn ? payloadTypes(tabsOwn) : [sent.pt, ...(rtx ? [rtx] : [])];
    if (listed.includes(sent.pt)) this.sendingOn.delete(mid);
    else this.sendingOn.set(mid, sent.pt);
    const sectionListing = (pt: string) => (tabsOwn && payloadTypes(tabsOwn).includes(pt) ? tabsOwn : sent.section);
    return joined(
      sectionsOf(offer).map((section) => {
        if (midOf(section) !== mid) return section;
        const [mLine, ...rest] = section;
        const kept = rest.filter((line) => payloadTypeOf(line) === null);
        const codecsAt = kept.findIndex((line) => line.startsWith("a=rtcp-mux")) + 1 || kept.length;
        const codecs = listed.flatMap((pt) => codecLines(sectionListing(pt), pt));
        return [mLine!.replace(/^(m=\S+ \d+ \S+) .*$/, `$1 ${listed.join(" ")}`), ...kept.slice(0, codecsAt), ...codecs, ...kept.slice(codecsAt)];
      }),
    );
  }

  /** Takes the tab's answer to a watch. */
  async pulled(answer: string) {
    await this.peer.setRemoteDescription({ type: "answer", sdp: this.goingOutOn(answer) });
  }

  /**
   * The tab's answer as this peer takes it, so that its sender goes out on the payload
   * type the media server would: in a section whose answer lacks it, the section's first
   * codec renumbered to it, and its retransmissions pointed at it.
   */
  private goingOutOn(answer: string): string {
    const sent = this.goingOutAs();
    return joined(
      sectionsOf(answer).map((section) => {
        const mid = midOf(section);
        const pt = mid === null ? undefined : this.sendingOn.get(mid);
        const first = payloadTypes(section)[0];
        if (!sent || pt === undefined || first === undefined || payloadTypes(section).includes(pt)) return section;
        const [mLine, ...rest] = section;
        return [
          mLine!.replace(new RegExp(` ${first}( |$)`), ` ${pt}$1`),
          ...rest.flatMap((line) => {
            if (payloadTypeOf(line) !== first) return [line.replace(new RegExp(`apt=${first}$`), `apt=${pt}`)];
            if (line.startsWith("a=rtcp-fb:")) return [line.replace(`:${first} `, `:${pt} `)];
            return codecLines(sent.section, pt).filter((one) => one.startsWith(line.slice(0, line.indexOf(":"))));
          }),
        ];
      }),
    );
  }

  /** Ends the watch on `mid`, as the media server closes a track: no negotiation until the next. */
  async unpull(mid: string) {
    const transceiver = this.peer.getTransceivers().find((one) => one.mid === mid);
    await transceiver?.sender.replaceTrack(null);
    if (transceiver) transceiver.direction = "inactive";
    this.pulling.delete(mid);
    this.sendingOn.delete(mid);
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

/** The kind of track the section of `mid` carries on `peer`. */
function kindOf(peer: RTCPeerConnection, mid: string): string | undefined {
  return peer.getTransceivers().find((one) => one.mid === mid)?.receiver.track.kind;
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
