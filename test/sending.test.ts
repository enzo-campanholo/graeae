// What a share sends on a weak upload, and what its sharer is told: one pure rule, fed
// readings of the share's statistics. The expected values are the spec's (Encoding and
// quality, The room's screen) and the thresholds this ticket chose, written out here as
// numbers rather than read back from the code.

import { describe, expect, it } from "vitest";
import {
  nextSending,
  readingOf,
  sharerNotes,
  startSending,
  stepEncodings,
  type Reading,
  type Sending,
} from "../src/app/lib/media/sending.ts";
import { encodingPlan } from "../src/shared/encoding.ts";

const chromiumScreen = encodingPlan("chromium", "screen");

/** `sending` after `readings`, one every 2 seconds from `from` seconds on, each `reading`. */
function after(sending: Sending, count: number, reading: Omit<Reading, "at">, from: number): Sending {
  for (let i = 0; i < count; i++) sending = nextSending(sending, { ...reading, at: (from + i * 2) * 1000 });
  return sending;
}

const limited = { limited: true };
const calm = { limited: false };

describe("a share on a weak upload", () => {
  it("starts at its full plan with no note", () => {
    const sending = startSending(chromiumScreen);
    expect(sending.step).toBe("full");
    expect(sharerNotes(sending)).toEqual({ at48: false, software: false, upload: null });
  });

  it("stops its 1080p quality after 6 seconds limited by the upload, and drops to 30 fps after 6 more", () => {
    let sending = after(startSending(chromiumScreen), 2, limited, 0);
    expect(sending.step).toBe("full");
    sending = after(sending, 1, limited, 4);
    expect(sending.step).toBe("720p");
    expect(sharerNotes(sending).upload).toBe("720p");
    sending = after(sending, 3, limited, 6);
    expect(sending.step).toBe("720p30");
    expect(sharerNotes(sending).upload).toBe("720p30");
  });

  it("goes no lower than 720p30, however long the upload stays weak, and never ends", () => {
    const sending = after(startSending(chromiumScreen), 100, limited, 0);
    expect(sending.step).toBe("720p30");
  });

  it("does not step down on a moment's limit", () => {
    let sending = startSending(chromiumScreen);
    for (let i = 0; i < 20; i++) sending = nextSending(sending, { at: i * 2000, limited: i % 3 !== 2 });
    expect(sending.step).toBe("full");
  });

  it("steps back up one step at a time after 30 seconds with the upload not limiting it", () => {
    let sending = after(startSending(chromiumScreen), 6, limited, 0);
    expect(sending.step).toBe("720p30");
    sending = after(sending, 15, calm, 12);
    expect(sending.step).toBe("720p30");
    sending = after(sending, 1, calm, 42);
    expect(sending.step).toBe("720p");
    sending = after(sending, 16, calm, 44);
    expect(sending.step).toBe("full");
    expect(sharerNotes(sending).upload).toBeNull();
  });

  it("waits twice as long to try again after a step up that did not hold, up to 8 minutes", () => {
    // Down at 4 s, back up at 36 s, down again at 42 s: the next try waits 60 s.
    let sending = after(startSending(chromiumScreen), 3, limited, 0);
    sending = after(sending, 16, calm, 6);
    expect(sending.step).toBe("full");
    sending = after(sending, 3, limited, 38);
    expect(sending.step).toBe("720p");
    sending = after(sending, 30, calm, 44);
    expect(sending.step).toBe("720p");
    sending = after(sending, 1, calm, 104);
    expect(sending.step).toBe("full");

    // Failing again and again, the wait stops growing at 8 minutes.
    let at = 106;
    for (let i = 0; i < 8; i++) {
      sending = after(sending, 3, limited, at);
      at += 6;
      while (sending.step !== "full") sending = after(sending, 1, calm, (at += 2));
    }
    sending = after(sending, 3, limited, at);
    const down = at + 4;
    let up = down;
    while (sending.step !== "full") sending = after(sending, 1, calm, (up += 2));
    expect(up - down).toBe(482);
  });

  it("waits 30 seconds again once a step up has held for a minute", () => {
    let sending = after(startSending(chromiumScreen), 3, limited, 0);
    sending = after(sending, 16, calm, 6); // up at 36 s
    sending = after(sending, 3, limited, 38); // down at 42 s: the wait is 60 s
    sending = after(sending, 31, calm, 44); // up at 104 s
    expect(sending.step).toBe("full");
    sending = after(sending, 30, calm, 106); // held past 164 s
    sending = after(sending, 3, limited, 166); // down at 170 s
    sending = after(sending, 16, calm, 172); // 30 s later
    expect(sending.step).toBe("full");
  });

  it("has nothing to step down for a webcam, which already goes out at 720p30", () => {
    const sending = after(startSending(encodingPlan("chromium", "webcam")), 20, limited, 0);
    expect(sending.step).toBe("full");
    expect(sharerNotes(sending).upload).toBeNull();
  });

  it("gives up 1080p on a Firefox screen share, which already goes out at 30 fps", () => {
    const sending = after(startSending(encodingPlan("firefox", "screen")), 20, limited, 0);
    expect(sending.step).toBe("720p");
    expect(sharerNotes(sending).upload).toBe("720p");
  });

  it("gives up 1080p, then 60 fps, on a Chromium screen share sent at one quality", () => {
    const plan = encodingPlan("chromium", "screen", { twoQualities: false });
    let sending = after(startSending(plan), 3, limited, 0);
    expect(sending.step).toBe("720p");
    sending = after(sending, 3, limited, 6);
    expect(sending.step).toBe("720p30");
  });
});

describe("what each step sends", () => {
  it("stops the 1080p quality of a two-quality share, then limits its 720p quality to 30 fps", () => {
    expect(stepEncodings(chromiumScreen, "full", 1080)).toEqual([
      { rid: "f", active: true, maxBitrate: 12_000_000, maxFramerate: 60, scaleResolutionDownBy: 1 },
      { rid: "h", active: true, maxBitrate: 4_000_000, maxFramerate: 60, scaleResolutionDownBy: 1.5 },
    ]);
    expect(stepEncodings(chromiumScreen, "720p", 1080)).toEqual([
      { rid: "f", active: false, maxBitrate: 12_000_000, maxFramerate: 60, scaleResolutionDownBy: 1 },
      { rid: "h", active: true, maxBitrate: 4_000_000, maxFramerate: 60, scaleResolutionDownBy: 1.5 },
    ]);
    expect(stepEncodings(chromiumScreen, "720p30", 1440)).toEqual([
      { rid: "f", active: false, maxBitrate: 12_000_000, maxFramerate: 60, scaleResolutionDownBy: 1440 / 1080 },
      { rid: "h", active: true, maxBitrate: 2_500_000, maxFramerate: 30, scaleResolutionDownBy: 2 },
    ]);
  });

  it("scales a one-quality share down to 720p, at 4 Mbps for 60 fps and 2.5 Mbps for 30", () => {
    const one = encodingPlan("chromium", "screen", { twoQualities: false });
    expect(stepEncodings(one, "720p", 1080)).toEqual([
      { active: true, maxBitrate: 4_000_000, maxFramerate: 60, scaleResolutionDownBy: 1.5 },
    ]);
    expect(stepEncodings(one, "720p30", 1080)).toEqual([
      { active: true, maxBitrate: 2_500_000, maxFramerate: 30, scaleResolutionDownBy: 1.5 },
    ]);
    expect(stepEncodings(encodingPlan("firefox", "screen"), "720p", 1080)).toEqual([
      { active: true, maxBitrate: 2_500_000, maxFramerate: 30, scaleResolutionDownBy: 1.5 },
    ]);
  });

  it("never scales a small window up", () => {
    expect(stepEncodings(chromiumScreen, "720p30", 600).map((encoding) => encoding.scaleResolutionDownBy)).toEqual([1, 1]);
  });
});

describe("the note on capturing at 48 fps", () => {
  it("appears once the capture has settled near 48 fps for 10 seconds", () => {
    let sending = after(startSending(chromiumScreen), 4, { captureFps: 47.6 }, 0);
    expect(sharerNotes(sending).at48).toBe(false);
    sending = after(sending, 1, { captureFps: 48.3 }, 8);
    expect(sharerNotes(sending).at48).toBe(true);
  });

  it("does not appear for a capture that only passes through 48", () => {
    let sending = startSending(chromiumScreen);
    for (const [i, captureFps] of [48, 48, 59.8, 48, 48, 48, 12, 48].entries())
      sending = nextSending(sending, { at: i * 2000, captureFps });
    expect(sharerNotes(sending).at48).toBe(false);
  });

  it("goes once the capture settles at 60, so it stops appearing when the browser captures 60", () => {
    let sending = after(startSending(chromiumScreen), 5, { captureFps: 48 }, 0);
    sending = after(sending, 4, { captureFps: 60 }, 10);
    expect(sharerNotes(sending).at48).toBe(true);
    sending = after(sending, 1, { captureFps: 59.9 }, 18);
    expect(sharerNotes(sending).at48).toBe(false);
  });

  it("never appears for a share that asks for 30 fps or less", () => {
    for (const plan of [encodingPlan("chromium", "webcam"), encodingPlan("firefox", "screen")]) {
      expect(sharerNotes(after(startSending(plan), 10, { captureFps: 48 }, 0)).at48).toBe(false);
    }
  });
});

describe("the note on software encoding", () => {
  it("follows what the last reading said of the encoder", () => {
    let sending = after(startSending(chromiumScreen), 1, { software: true }, 0);
    expect(sharerNotes(sending).software).toBe(true);
    sending = after(sending, 1, {}, 2);
    expect(sharerNotes(sending).software).toBe(true);
    sending = after(sending, 1, { software: false }, 4);
    expect(sharerNotes(sending).software).toBe(false);
  });
});

describe("a reading of the browser's statistics", () => {
  const hardware = { type: "outbound-rtp", kind: "video", active: true, powerEfficientEncoder: true };

  it("reads the capture's frame rate", () => {
    expect(readingOf([{ type: "media-source", kind: "video", framesPerSecond: 48 }, hardware], 0).captureFps).toBe(48);
  });

  it("is limited when a quality being sent is limited by the upload", () => {
    const reports = [
      { type: "outbound-rtp", kind: "video", rid: "f", active: true, qualityLimitationReason: "bandwidth" },
      { type: "outbound-rtp", kind: "video", rid: "h", active: true, qualityLimitationReason: "none" },
    ];
    expect(readingOf(reports, 0).limited).toBe(true);
  });

  it("is not limited by a quality that was stopped, or by the processor", () => {
    const reports = [
      { type: "outbound-rtp", kind: "video", rid: "f", active: false, qualityLimitationReason: "bandwidth" },
      { type: "outbound-rtp", kind: "video", rid: "h", active: true, qualityLimitationReason: "cpu" },
    ];
    expect(readingOf(reports, 0).limited).toBe(false);
  });

  it("is software encoded when the browser says the encoder is not power efficient, or names a software encoder", () => {
    expect(readingOf([{ ...hardware, powerEfficientEncoder: false }], 0).software).toBe(true);
    const named = (encoderImplementation: string) => [{ type: "outbound-rtp", kind: "video", encoderImplementation }];
    expect(readingOf(named("SimulcastEncoderAdapter (OpenH264, OpenH264)"), 0).software).toBe(true);
    expect(readingOf(named("libvpx"), 0).software).toBe(true);
    expect(readingOf(named("MediaFoundationVideoEncodeAccelerator"), 0).software).toBe(false);
    expect(readingOf(named("ExternalEncoder"), 0).software).toBe(false);
    expect(readingOf([hardware], 0).software).toBe(false);
  });

  it("says nothing of what the browser does not report", () => {
    expect(readingOf([{ type: "outbound-rtp", kind: "audio", qualityLimitationReason: "bandwidth" }], 5)).toEqual({
      at: 5,
      limited: false,
    });
  });
});
