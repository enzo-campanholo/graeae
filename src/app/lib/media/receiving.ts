// The codecs a transceiver the tab does not send on keeps in the tab's own offers (ticket
// 58), as a pure rule. Chrome offers such a transceiver its whole list again, payload
// types the section never negotiated among them, and the media server goes by the last
// payload type it saw for a codec in any section: it sent a watch on H.264 42e01f's 108,
// which only an ended watch's section had offered, in a section that knew only 42001f's
// 102, and Chrome dropped every packet. So the transceiver is set to what its section
// negotiated (`RTCRtpReceiver.getParameters().codecs`), and its payload types stay put.

/** A codec as `RTCRtpReceiver.getParameters` or `getCapabilities` gives it, cut down to what the rule reads. */
export interface ReceivingCodec {
  mimeType: string;
  clockRate: number;
  channels?: number;
  sdpFmtpLine?: string;
}

/** Formats that repair a stream rather than carry it: `setCodecPreferences` refuses a list of these alone. */
const REPAIR = /^(video|audio)\/(rtx|red|ulpfec|flexfec-03)$/i;

/**
 * The capabilities, of `capabilities`, that `negotiated` lists, in the section's order,
 * for `setCodecPreferences`. Empty when that would leave the transceiver nothing to
 * carry, for the browser's own list to stand.
 */
export function receivingCodecs<T extends ReceivingCodec>(negotiated: readonly ReceivingCodec[], capabilities: readonly T[]): T[] {
  const kept: T[] = [];
  for (const codec of negotiated) {
    const capability = capabilities.find((one) => matches(codec, one));
    if (capability && !kept.includes(capability)) kept.push(capability);
  }
  return kept.some((one) => !REPAIR.test(one.mimeType)) ? kept : [];
}

/**
 * Whether `capability` is the codec the section negotiated as `codec`. Every parameter
 * the capability names must be the codec's, in any order; the section may add its own
 * (opus's stereo), and a repair format's (rtx's apt) is the payload type it repairs.
 */
function matches(codec: ReceivingCodec, capability: ReceivingCodec): boolean {
  if (codec.mimeType.toLowerCase() !== capability.mimeType.toLowerCase()) return false;
  if (codec.clockRate !== capability.clockRate) return false;
  if (codec.channels !== undefined && capability.channels !== undefined && codec.channels !== capability.channels) return false;
  if (/^(video|audio)\/rtx$/i.test(codec.mimeType)) return true;
  const given = parameters(codec.sdpFmtpLine);
  return [...parameters(capability.sdpFmtpLine)].every(([name, value]) => given.get(name) === value);
}

function parameters(fmtp: string | undefined): Map<string, string> {
  const found = new Map<string, string>();
  for (const pair of fmtp?.split(";") ?? []) {
    const at = pair.indexOf("=");
    if (pair.trim() !== "") found.set((at < 0 ? pair : pair.slice(0, at)).trim().toLowerCase(), at < 0 ? "" : pair.slice(at + 1).trim());
  }
  return found;
}
