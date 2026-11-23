// The codecs a transceiver the tab does not send on keeps in the tab's own offers (ticket
// 58): those its section negotiated, not Chrome's full list. The expected values come from
// ticket 58's descriptions on graeae-test, not from the code. An ended watch's section had
// negotiated H.264 42001f (102) and its retransmissions (103), and the second share's offer
// listed Chrome's whole list there. The media server then sent the next watch on that
// list's 108, H.264 42e01f, in a section that knew only 102, and Chrome dropped every packet.

import { describe, expect, it } from "vitest";
import { receivingCodecs } from "../src/app/lib/media/receiving.ts";

/** Chrome 158's `RTCRtpReceiver.getCapabilities("video")`, in its order. */
const VIDEO = [
  { mimeType: "video/VP8", clockRate: 90000 },
  { mimeType: "video/rtx", clockRate: 90000 },
  { mimeType: "video/VP9", clockRate: 90000, sdpFmtpLine: "profile-id=0" },
  { mimeType: "video/VP9", clockRate: 90000, sdpFmtpLine: "profile-id=2" },
  { mimeType: "video/H264", clockRate: 90000, sdpFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f" },
  { mimeType: "video/H264", clockRate: 90000, sdpFmtpLine: "level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=42001f" },
  { mimeType: "video/H264", clockRate: 90000, sdpFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f" },
  { mimeType: "video/H264", clockRate: 90000, sdpFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=64001f" },
  { mimeType: "video/AV1", clockRate: 90000, sdpFmtpLine: "level-idx=5;profile=0;tier=0" },
  { mimeType: "video/red", clockRate: 90000 },
  { mimeType: "video/ulpfec", clockRate: 90000 },
];

const AUDIO = [
  { mimeType: "audio/opus", clockRate: 48000, channels: 2, sdpFmtpLine: "minptime=10;useinbandfec=1" },
  { mimeType: "audio/red", clockRate: 48000, channels: 2, sdpFmtpLine: "111/111" },
  { mimeType: "audio/G722", clockRate: 8000, channels: 1 },
  { mimeType: "audio/PCMU", clockRate: 8000, channels: 1 },
];

describe("the codecs a transceiver the tab does not send on keeps in its offers", () => {
  it("are those its section negotiated: on graeae-test, H.264 42001f and its retransmissions, not 42e01f", () => {
    const negotiated = [
      { payloadType: 102, mimeType: "video/H264", clockRate: 90000, sdpFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f" },
      { payloadType: 103, mimeType: "video/rtx", clockRate: 90000, sdpFmtpLine: "apt=102" },
    ];

    expect(receivingCodecs(negotiated, VIDEO)).toEqual([
      { mimeType: "video/H264", clockRate: 90000, sdpFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f" },
      { mimeType: "video/rtx", clockRate: 90000 },
    ]);
  });

  it("keep a screen share's H.264 high, in the section's order", () => {
    const negotiated = [
      { payloadType: 112, mimeType: "video/H264", clockRate: 90000, sdpFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=64001f" },
      { payloadType: 113, mimeType: "video/rtx", clockRate: 90000, sdpFmtpLine: "apt=112" },
      { payloadType: 102, mimeType: "video/H264", clockRate: 90000, sdpFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f" },
      { payloadType: 103, mimeType: "video/rtx", clockRate: 90000, sdpFmtpLine: "apt=102" },
      { payloadType: 120, mimeType: "video/ulpfec", clockRate: 90000 },
    ];

    expect(receivingCodecs(negotiated, VIDEO).map((codec) => `${codec.mimeType} ${codec.sdpFmtpLine ?? ""}`.trim())).toEqual([
      "video/H264 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=64001f",
      "video/rtx",
      "video/H264 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f",
      "video/ulpfec",
    ]);
  });

  it("match a codec whose parameters the section gave in another order, or added to", () => {
    const negotiated = [
      { payloadType: 111, mimeType: "audio/opus", clockRate: 48000, channels: 2, sdpFmtpLine: "useinbandfec=1;stereo=1;sprop-stereo=1;minptime=10" },
      { payloadType: 63, mimeType: "audio/red", clockRate: 48000, channels: 2, sdpFmtpLine: "111/111" },
    ];

    expect(receivingCodecs(negotiated, AUDIO)).toEqual([AUDIO[0], AUDIO[1]]);
  });

  it("are left to the browser when the section negotiated nothing, or nothing the browser lists", () => {
    expect(receivingCodecs([], VIDEO)).toEqual([]);
    expect(receivingCodecs([{ mimeType: "video/H265", clockRate: 90000 }], VIDEO)).toEqual([]);
  });

  it("are left to the browser when only a repair format matches, which the browser refuses alone", () => {
    expect(receivingCodecs([{ mimeType: "video/rtx", clockRate: 90000, sdpFmtpLine: "apt=102" }], VIDEO)).toEqual([]);
  });
});
