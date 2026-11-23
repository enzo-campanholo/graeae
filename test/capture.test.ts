// A screen share's capture: what graeae asks the browser's picker for, taking the browser
// family, and which audio the picker gives is screen audio. The expected values come from
// the spec's Screen audio section and Chromium's own track labels, not from the code.

import { describe, expect, it } from "vitest";
import { browserFamily, isScreenAudio, screenCapture, stereoOpus } from "../src/app/lib/media/capture.ts";

describe("a screen capture on Chromium", () => {
  const asked = screenCapture("chromium");

  it("asks for screen audio in stereo, with echo cancellation, noise suppression and automatic gain off", () => {
    expect(asked.audio).toMatchObject({
      channelCount: 2,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
  });

  it("always leaves the sharing page's own audio out", () => {
    expect(asked.audio).toMatchObject({ restrictOwnAudio: true });
    expect(asked.selfBrowserSurface).toBe("exclude");
  });

  it("never asks for the whole system's sound, and asks a window for its own application's", () => {
    expect(asked.systemAudio).toBe("exclude");
    expect(asked.windowAudio).toBe("window");
  });

  it("asks the picker to have its audio checkbox ticked", () => {
    expect(asked.audioSelection).toBe("preferred");
  });

  it("asks for a picture up to 1080p at 120 fps, so a full 60 gets through to the sender", () => {
    expect(asked.video).toEqual({ width: { max: 1920 }, height: { max: 1080 }, frameRate: { ideal: 120, max: 120 } });
  });
});

describe("a screen capture on Firefox", () => {
  const asked = screenCapture("firefox");

  it("asks for video only, which is all Firefox captures", () => {
    expect(asked.audio).toBe(false);
  });

  it("asks for a picture up to 1080p at 30 fps, and nothing of Chromium's picker", () => {
    expect(asked).toEqual({
      video: { width: { max: 1920 }, height: { max: 1080 }, frameRate: { ideal: 30, max: 30 } },
      audio: false,
    });
  });
});

describe("the browser family", () => {
  it("is Firefox for Firefox", () => {
    expect(browserFamily("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0")).toBe(
      "firefox",
    );
  });

  it("is Chromium for Chrome, and for any other browser, which takes what it understands of the request", () => {
    expect(
      browserFamily(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36",
      ),
    ).toBe("chromium");
    expect(
      browserFamily(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
      ),
    ).toBe("chromium");
  });
});

describe("which captured audio is screen audio", () => {
  it("is a tab's sound or one application's, by the names Chromium gives them", () => {
    expect(isScreenAudio("Tab audio")).toBe(true);
    expect(isScreenAudio("Application Audio")).toBe(true);
  });

  it("is never the whole system's sound, a track with no name, or a name spelt otherwise", () => {
    expect(isScreenAudio("System Audio")).toBe(false);
    expect(isScreenAudio("")).toBe(false);
    expect(isScreenAudio("tab audio")).toBe(false);
  });
});

describe("screen audio's description", () => {
  const offer = [
    "v=0",
    "m=audio 9 UDP/TLS/RTP/SAVPF 111 63",
    "a=rtpmap:111 opus/48000/2",
    "a=fmtp:111 minptime=10;useinbandfec=1",
    "a=rtpmap:63 red/48000/2",
    "a=fmtp:63 111/111",
    "",
  ].join("\r\n");

  it("asks for Opus in stereo, both ways", () => {
    expect(stereoOpus(offer)).toContain("a=fmtp:111 minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1\r\n");
  });

  it("leaves every other codec alone", () => {
    expect(stereoOpus(offer)).toContain("a=fmtp:63 111/111\r\n");
  });

  it("is said once however often it is applied", () => {
    expect(stereoOpus(stereoOpus(offer))).toBe(stereoOpus(offer));
  });
});
