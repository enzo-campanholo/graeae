// The encoding plan: one pure rule, taking the browser family and the kind of share. The
// expected values are the spec's table under Encoding and quality, not the code's.

import { describe, expect, it } from "vitest";
import { codecPreferences, hardwareQuery, receivedQuality, sendEncodings } from "../src/app/lib/media/encodings.ts";
import { encodingPlan } from "../src/shared/encoding.ts";

const HARDWARE_FIRST = [{ mimeType: "video/H264", profile: "baseline" }, { mimeType: "video/VP8" }];
/** A Chromium screen share at one quality: H.264 high when encoded in hardware, then as `HARDWARE_FIRST` (ticket 54). */
const HIGH_FIRST = [{ mimeType: "video/H264", profile: "high" }, ...HARDWARE_FIRST];

const SENT_AT_TWO_QUALITIES = { twoQualities: true };

describe("a Chromium screen share sent at two qualities", () => {
  const plan = encodingPlan("chromium", "screen", SENT_AT_TWO_QUALITIES);

  it("goes out at 1080p60 limited to 12 Mbps and at 720p60 limited to 4 Mbps", () => {
    expect(plan.qualities).toEqual([
      { name: "1080p", rid: "f", height: 1080, maxFramerate: 60, maxBitrate: 12_000_000 },
      { name: "720p", rid: "h", height: 720, maxFramerate: 60, maxBitrate: 4_000_000 },
    ]);
  });

  it("offers H.264 baseline profile, then a software codec last", () => {
    expect(plan.codecs).toEqual(HARDWARE_FIRST);
  });

  it("asks the capture for 120 fps, at most 1080p, while the sender is limited to 60", () => {
    expect(plan.capture).toEqual({ width: 1920, height: 1080, frameRate: 120 });
  });

  it("counts 12 Mbps as its maximum bitrate", () => {
    expect(plan.maxBitrate).toBe(12_000_000);
  });
});

describe("a Firefox screen share", () => {
  const plan = encodingPlan("firefox", "screen");

  it("has one quality: 1080p limited to 30 fps and 6 Mbps", () => {
    expect(plan.qualities).toEqual([{ name: "1080p", height: 1080, maxFramerate: 30, maxBitrate: 6_000_000 }]);
  });

  it("goes out in VP9, with a software codec after it so it always starts", () => {
    expect(plan.codecs).toEqual([{ mimeType: "video/VP9" }, { mimeType: "video/VP8" }]);
  });

  it("asks the capture for 30 fps at most 1080p", () => {
    expect(plan.capture).toEqual({ width: 1920, height: 1080, frameRate: 30 });
  });

  it("counts 6 Mbps as its maximum bitrate", () => {
    expect(plan.maxBitrate).toBe(6_000_000);
  });
});

describe.each(["chromium", "firefox"] as const)("a webcam share on %s", (browser) => {
  const plan = encodingPlan(browser, "webcam");

  it("has one quality: 720p at 30 fps limited to 1.5 Mbps", () => {
    expect(plan.qualities).toEqual([{ name: "720p", height: 720, maxFramerate: 30, maxBitrate: 1_500_000 }]);
    expect(plan.capture).toEqual({ width: 1280, height: 720, frameRate: 30 });
  });

  it("offers H.264 baseline profile, then a software codec last", () => {
    expect(plan.codecs).toEqual(HARDWARE_FIRST);
  });

  it("counts 1.5 Mbps as its maximum bitrate", () => {
    expect(plan.maxBitrate).toBe(1_500_000);
  });
});

describe("with two qualities switched off", () => {
  it("is how a Chromium screen share goes out today (ticket 17)", () => {
    expect(encodingPlan("chromium", "screen")).toEqual(encodingPlan("chromium", "screen", { twoQualities: false }));
  });

  it("leaves a Chromium screen share one 1080p60 quality at 12 Mbps", () => {
    const plan = encodingPlan("chromium", "screen", { twoQualities: false });
    expect(plan.qualities).toEqual([{ name: "1080p", height: 1080, maxFramerate: 60, maxBitrate: 12_000_000 }]);
    expect(plan.capture.frameRate).toBe(120);
    expect(plan.maxBitrate).toBe(12_000_000);
  });

  it("offers a Chromium screen share H.264 high profile, then baseline, then a software codec last", () => {
    expect(encodingPlan("chromium", "screen", { twoQualities: false }).codecs).toEqual(HIGH_FIRST);
  });

  it("changes nothing else", () => {
    expect(encodingPlan("firefox", "screen", { twoQualities: false })).toEqual(encodingPlan("firefox", "screen"));
    expect(encodingPlan("chromium", "webcam", { twoQualities: false })).toEqual(encodingPlan("chromium", "webcam"));
  });
});

describe("what the browser gives up above a share's last step", () => {
  it("is frame rate on a Chromium screen share, which keeps its size, at one quality or two", () => {
    expect(encodingPlan("chromium", "screen").degradation).toBe("maintain-resolution");
    expect(encodingPlan("chromium", "screen", SENT_AT_TWO_QUALITIES).degradation).toBe("maintain-resolution");
  });

  it("is resolution on a Firefox screen share", () => {
    expect(encodingPlan("firefox", "screen").degradation).toBe("maintain-framerate");
  });

  it("is the browser's choice on a webcam share", () => {
    expect(encodingPlan("chromium", "webcam").degradation).toBe("balanced");
    expect(encodingPlan("firefox", "webcam").degradation).toBe("balanced");
  });
});

describe("every share", () => {
  it("never offers HEVC, and offers H.264 in baseline profile, or high on a Chromium screen share at one quality only", () => {
    for (const browser of ["chromium", "firefox"] as const) {
      for (const kind of ["screen", "webcam"] as const) {
        for (const twoQualities of [false, true]) {
          const highAllowed = browser === "chromium" && kind === "screen" && !twoQualities;
          for (const codec of encodingPlan(browser, kind, { twoQualities }).codecs) {
            expect(codec.mimeType).not.toMatch(/H265|HEVC/i);
            if (codec.mimeType === "video/H264") expect(codec.profile).toEqual(highAllowed ? expect.stringMatching(/^(high|baseline)$/) : "baseline");
          }
        }
      }
    }
  });
});

// What a browser reports in `RTCRtpSender.getCapabilities("video")`, cut down to what
// the order reads. Chromium 157 on Windows lists these, and Firefox lists the second set.
const CHROMIUM_CODECS = [
  { mimeType: "video/VP8", clockRate: 90000 },
  { mimeType: "video/rtx", clockRate: 90000 },
  { mimeType: "video/H264", clockRate: 90000, sdpFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f" },
  { mimeType: "video/H264", clockRate: 90000, sdpFmtpLine: "level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=42001f" },
  { mimeType: "video/H264", clockRate: 90000, sdpFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f" },
  { mimeType: "video/H264", clockRate: 90000, sdpFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=4d001f" },
  { mimeType: "video/H264", clockRate: 90000, sdpFmtpLine: "level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=4d001f" },
  { mimeType: "video/H264", clockRate: 90000, sdpFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=640034" },
  { mimeType: "video/AV1", clockRate: 90000, sdpFmtpLine: "level-idx=5;profile=0;tier=0" },
  { mimeType: "video/VP9", clockRate: 90000, sdpFmtpLine: "profile-id=0" },
  { mimeType: "video/H265", clockRate: 90000, sdpFmtpLine: "level-id=156;profile-id=1;tier-flag=0;tx-mode=SRST" },
  { mimeType: "video/red", clockRate: 90000 },
  { mimeType: "video/ulpfec", clockRate: 90000 },
];
const FIREFOX_CODECS = [
  { mimeType: "video/VP8", clockRate: 90000, sdpFmtpLine: "max-fs=12288;max-fr=60" },
  { mimeType: "video/VP9", clockRate: 90000, sdpFmtpLine: "max-fs=12288;max-fr=60" },
  { mimeType: "video/H264", clockRate: 90000, sdpFmtpLine: "profile-level-id=42e01f;level-asymmetry-allowed=1;packetization-mode=1" },
  { mimeType: "video/H264", clockRate: 90000, sdpFmtpLine: "profile-level-id=42e01f;level-asymmetry-allowed=1" },
  { mimeType: "video/H264", clockRate: 90000, sdpFmtpLine: "profile-level-id=42001f;level-asymmetry-allowed=1;packetization-mode=1" },
  { mimeType: "video/ulpfec", clockRate: 90000 },
  { mimeType: "video/red", clockRate: 90000 },
  { mimeType: "video/rtx", clockRate: 90000 },
];

/** H.264 high, as the browser's hardware check finds it (`mediaCapabilities.encodingInfo` says power-efficient). */
const HIGH = { mimeType: "video/H264", profile: "high" } as const;

const fmtp = (codec: { mimeType: string; sdpFmtpLine?: string }) =>
  `${codec.mimeType} ${codec.sdpFmtpLine?.match(/profile-level-id=(\w+)/)?.[1] ?? ""}`.trim();

describe("the codec order a browser is given", () => {
  // The media server picks its own favourite among the codecs offered, whatever their
  // order: offered H.264 baseline and VP8, it answers VP8. So only one codec is offered.
  it("on Chromium is H.264 baseline in packetization mode 1 alone, with the repair formats after", () => {
    const order = codecPreferences(encodingPlan("chromium", "screen").codecs, CHROMIUM_CODECS);
    expect(order.map(fmtp)).toEqual(["video/H264 42001f", "video/rtx", "video/red", "video/ulpfec"]);
    expect(order[0]?.sdpFmtpLine).toMatch(/packetization-mode=1/);
  });

  it("on Chromium is H.264 high alone when the browser lists it and encodes it in hardware", () => {
    const order = codecPreferences(encodingPlan("chromium", "screen").codecs, CHROMIUM_CODECS, [HIGH]);
    expect(order.map(fmtp)).toEqual(["video/H264 640034", "video/rtx", "video/red", "video/ulpfec"]);
  });

  it("on Chromium is H.264 baseline alone when the browser lists high but not in hardware", () => {
    const order = codecPreferences(encodingPlan("chromium", "screen").codecs, CHROMIUM_CODECS, []);
    expect(order.map(fmtp)).toEqual(["video/H264 42001f", "video/rtx", "video/red", "video/ulpfec"]);
  });

  it("on Chromium is H.264 baseline alone when the browser does not list high, whatever it says of hardware", () => {
    const noHigh = CHROMIUM_CODECS.filter((codec) => !codec.sdpFmtpLine?.includes("profile-level-id=6400"));
    const order = codecPreferences(encodingPlan("chromium", "screen").codecs, noHigh, [HIGH]);
    expect(order.map(fmtp)).toEqual(["video/H264 42001f", "video/rtx", "video/red", "video/ulpfec"]);
  });

  it("never takes high in packetization mode 0", () => {
    const highMode0 = CHROMIUM_CODECS.map((codec) =>
      codec.sdpFmtpLine?.includes("profile-level-id=6400") ? { ...codec, sdpFmtpLine: codec.sdpFmtpLine.replace("packetization-mode=1", "packetization-mode=0") } : codec,
    );
    const order = codecPreferences(encodingPlan("chromium", "screen").codecs, highMode0, [HIGH]);
    expect(order.map(fmtp)[0]).toBe("video/H264 42001f");
  });

  it("is VP8 alone on a browser with no H.264 baseline", () => {
    const noH264 = CHROMIUM_CODECS.filter((codec) => codec.mimeType !== "video/H264");
    const order = codecPreferences(encodingPlan("chromium", "screen").codecs, noH264).map(fmtp);
    expect(order).toEqual(["video/VP8", "video/rtx", "video/red", "video/ulpfec"]);
  });

  it("never holds constrained baseline, main or HEVC, and high only for a Chromium screen share at one quality", () => {
    for (const [browser, kind, twoQualities] of [
      ["chromium", "screen", false],
      ["chromium", "screen", true],
      ["chromium", "webcam", false],
      ["firefox", "webcam", false],
    ] as const) {
      const order = codecPreferences(encodingPlan(browser, kind, { twoQualities }).codecs, CHROMIUM_CODECS, [HIGH]).map(fmtp);
      expect(order.join(" ")).not.toMatch(/42e01f|4d001f|H265/);
      if (browser !== "chromium" || kind !== "screen" || twoQualities) expect(order.join(" ")).not.toMatch(/640034/);
    }
  });

  it("is H.264 baseline alone for a webcam on Firefox", () => {
    const order = codecPreferences(encodingPlan("firefox", "webcam").codecs, FIREFOX_CODECS).map(fmtp);
    expect(order).toEqual(["video/H264 42001f", "video/ulpfec", "video/red", "video/rtx"]);
  });

  it("is VP9 alone for a Firefox screen share", () => {
    const order = codecPreferences(encodingPlan("firefox", "screen").codecs, FIREFOX_CODECS).map(fmtp);
    expect(order).toEqual(["video/VP9", "video/ulpfec", "video/red", "video/rtx"]);
  });
});

describe("the encodings a share is sent with", () => {
  it("scale a 1440p monitor down to 1080p and to 720p for a Chromium screen share", () => {
    expect(sendEncodings(encodingPlan("chromium", "screen", SENT_AT_TWO_QUALITIES), 1440)).toEqual([
      { rid: "f", maxBitrate: 12_000_000, maxFramerate: 60, scaleResolutionDownBy: 1440 / 1080 },
      { rid: "h", maxBitrate: 4_000_000, maxFramerate: 60, scaleResolutionDownBy: 2 },
    ]);
  });

  it("send a 1080p capture as it is, and at 720p", () => {
    expect(sendEncodings(encodingPlan("chromium", "screen", SENT_AT_TWO_QUALITIES), 1080).map((e) => e.scaleResolutionDownBy)).toEqual([1, 1.5]);
  });

  it("never scale a small window up", () => {
    expect(sendEncodings(encodingPlan("chromium", "screen", SENT_AT_TWO_QUALITIES), 600).map((e) => e.scaleResolutionDownBy)).toEqual([1, 1]);
  });

  it("take the capture as asked when the browser does not say its size", () => {
    expect(sendEncodings(encodingPlan("chromium", "screen", SENT_AT_TWO_QUALITIES), undefined).map((e) => e.scaleResolutionDownBy)).toEqual([1, 1.5]);
  });

  it("are one, with no rid, for a single-quality share", () => {
    expect(sendEncodings(encodingPlan("chromium", "webcam"), 720)).toEqual([
      { maxBitrate: 1_500_000, maxFramerate: 30, scaleResolutionDownBy: 1 },
    ]);
    expect(sendEncodings(encodingPlan("firefox", "screen"), 1080)).toEqual([
      { maxBitrate: 6_000_000, maxFramerate: 30, scaleResolutionDownBy: 1 },
    ]);
  });
});

describe("the quality a watched share is received at", () => {
  it("is 720p at 720 lines or fewer, 1080p above, and unknown before a frame arrives", () => {
    expect(receivedQuality(1080)).toBe("1080p");
    expect(receivedQuality(900)).toBe("1080p");
    expect(receivedQuality(720)).toBe("720p");
    expect(receivedQuality(540)).toBe("720p");
    expect(receivedQuality(undefined)).toBeNull();
  });
});

describe("what the browser is asked before it offers a codec", () => {
  const plan = encodingPlan("chromium", "screen");

  it("is whether it encodes H.264 high power-efficiently, at 1080p60 and 12 Mbps, in a call", () => {
    expect(hardwareQuery(HIGH, plan)).toEqual({
      type: "webrtc",
      video: { contentType: "video/H264; profile-level-id=64001f; packetization-mode=1", width: 1920, height: 1080, framerate: 60, bitrate: 12_000_000 },
    });
  });

  it("is nothing for H.264 baseline or VP8, which are offered whenever the browser lists them", () => {
    expect(hardwareQuery({ mimeType: "video/H264", profile: "baseline" }, plan)).toBeNull();
    expect(hardwareQuery({ mimeType: "video/VP8" }, plan)).toBeNull();
  });
});
