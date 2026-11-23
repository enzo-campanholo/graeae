// How the real media client lets go of a stopped share's transceiver (ticket 57), as a pure
// rule. Chrome keeps an inactive transceiver's encoder, and a GPU has only so many in
// hardware (12 on ticket 57's machine), so a transceiver is stopped: the next negotiation
// rejects its media section and lets the encoder go. Two kinds are left inactive instead.
// The BUNDLE tag's (RFC 9143), the first mid of the BUNDLE group: rejecting it makes Chrome
// build a new transport that the media server never connects. And one whose offer was never
// answered: stopping it leaves the next share's transceiver with no mid, and it never had
// an encoder. The tag's keeps one, one per connection at most.

/** What the rule reads of an `RTCRtpTransceiver`. */
interface Transceiver {
  mid: string | null;
  currentDirection: string | null;
}

export function stopping(transceiver: Transceiver, localSdp: string | undefined): "stop" | "inactive" {
  if (transceiver.mid === null || transceiver.currentDirection === null) return "inactive";
  return transceiver.mid === bundleTag(localSdp) ? "inactive" : "stop";
}

function bundleTag(sdp: string | undefined): string | null {
  return sdp?.match(/^a=group:BUNDLE +(\S+)/m)?.[1] ?? null;
}
