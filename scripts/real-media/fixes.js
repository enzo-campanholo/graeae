// Runs in graeae's page when `member.ts` is given `--max-bitrate`, `--start-bitrate`,
// `--content-hint`, `--degradation` or `--codec`, to try share-reliability's fixes for Chrome's upload estimate without
// touching graeae. Unlike page.js, this changes what the page does.
//   - maxBitrate, startBitrate: every answer the page receives carries
//     `x-google-max-bitrate=<kbps>` (fix A: Chrome's probes may go past its built-in
//     5 Mbps) or `x-google-start-bitrate=<kbps>` (fix C) on each video codec.
//   - contentHint: whatever hint the page sets on a video track, this one is set instead (fix B).
//   - degradation: likewise for degradationPreference (share-reliability ticket 01).
/* global window, console, RTCPeerConnection, RTCRtpSender, RTCRtpTransceiver, MediaStreamTrack */

const { maxBitrate, startBitrate, contentHint } = window.__realMediaFixes ?? {};
const added = [maxBitrate && `x-google-max-bitrate=${maxBitrate}`, startBitrate && `x-google-start-bitrate=${startBitrate}`].filter(Boolean);

if (added.length) {
  const set = RTCPeerConnection.prototype.setRemoteDescription;
  RTCPeerConnection.prototype.setRemoteDescription = function (description, ...rest) {
    if (description?.type === "answer" && description.sdp) {
      const video = new Set([...description.sdp.matchAll(/^a=rtpmap:(\d+) (H264|VP8|VP9|AV1)\//gm)].map((match) => match[1]));
      const withFmtp = new Set([...description.sdp.matchAll(/^a=fmtp:(\d+) /gm)].map((match) => match[1]));
      const params = added.join(";");
      const sdp = description.sdp
        .replace(/^a=fmtp:(\d+) (.*?)(\r?)$/gm, (line, type, existing, cr) =>
          video.has(type) && !existing.includes("x-google-") ? `a=fmtp:${type} ${existing};${params}${cr}` : line,
        )
        // VP8 has no fmtp line of its own: one is added after its rtpmap.
        .replace(/^a=rtpmap:(\d+) (VP8|VP9|AV1)\/.*?(\r?)$/gm, (line, type, _name, cr) =>
          withFmtp.has(type) ? line : `${line}\na=fmtp:${type} ${params}${cr}`,
        );
      console.info(`[real-media] answer given ${params} on ${[...video].join(", ") || "no video codec"}`);
      return set.call(this, { type: "answer", sdp }, ...rest);
    }
    return set.call(this, description, ...rest);
  };
}

if (contentHint !== undefined) {
  const property = Object.getOwnPropertyDescriptor(MediaStreamTrack.prototype, "contentHint");
  Object.defineProperty(MediaStreamTrack.prototype, "contentHint", {
    ...property,
    set(value) {
      const chosen = this.kind === "video" ? contentHint : value;
      if (chosen !== value) console.info(`[real-media] contentHint "${chosen}" set instead of "${value}"`);
      property.set.call(this, chosen);
    },
  });
}

// degradation: whatever degradationPreference the page sets on a sender, this one is set instead.
const { degradation } = window.__realMediaFixes ?? {};
if (degradation) {
  const setParameters = RTCRtpSender.prototype.setParameters;
  RTCRtpSender.prototype.setParameters = function (parameters, ...rest) {
    if (this.track?.kind === "video" && parameters && parameters.degradationPreference !== degradation) {
      console.info(`[real-media] degradationPreference "${degradation}" set instead of "${parameters.degradationPreference}"`);
      parameters.degradationPreference = degradation;
    }
    return setParameters.call(this, parameters, ...rest);
  };
}

// codec: whatever codecs the page offers for video, only this one is offered instead, with
// the repair formats after it: "VP8", "AV1", or "H264:<profile>" with a profile-level-id
// prefix such as 6400 (high) or 4200 (baseline), packetization mode 1 only, as graeae's own.
const { codec } = window.__realMediaFixes ?? {};
if (codec) {
  const [mime, profile] = codec.split(":");
  const wanted = (capability) =>
    capability.mimeType.toLowerCase() === `video/${mime}`.toLowerCase() &&
    (!profile ||
      (new RegExp(`profile-level-id=${profile}`, "i").test(capability.sdpFmtpLine ?? "") &&
        /packetization-mode=1/.test(capability.sdpFmtpLine ?? "")));
  const repair = (capability) => /^video\/(rtx|red|ulpfec|flexfec-03)$/i.test(capability.mimeType);
  const setCodecPreferences = RTCRtpTransceiver.prototype.setCodecPreferences;
  RTCRtpTransceiver.prototype.setCodecPreferences = function (codecs, ...rest) {
    if (!codecs?.some((each) => each.mimeType.toLowerCase().startsWith("video/"))) return setCodecPreferences.call(this, codecs, ...rest);
    const all = RTCRtpSender.getCapabilities("video")?.codecs ?? [];
    const chosen = all.filter(wanted);
    if (chosen.length === 0) {
      console.info(`[real-media] codec ${codec}: the browser has none to send, so the page's own are offered`);
      return setCodecPreferences.call(this, codecs, ...rest);
    }
    console.info(`[real-media] codec ${codec} offered instead: ${chosen.map((each) => each.sdpFmtpLine ?? each.mimeType).join(" | ")}`);
    return setCodecPreferences.call(this, [...chosen, ...all.filter(repair)], ...rest);
  };
}
