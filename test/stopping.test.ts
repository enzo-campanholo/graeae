// How the real media client lets go of a stopped share's transceiver (ticket 57): stopped,
// so Chrome rejects its section and frees its encoder, unless that is unsafe. The expected
// values come from ticket 57's checks on graeae-test and in Chromium 158, not from the code:
// rejecting the BUNDLE tag's section (RFC 9143) made a transport the media server never
// connected, and stopping a transceiver whose offer was never answered left the next share
// with no mid.

import { describe, expect, it } from "vitest";
import { stopping } from "../src/app/lib/media/stopping.ts";

const description = (bundle: string) =>
  ["v=0", `a=group:BUNDLE ${bundle}`, "m=video 9 UDP/TLS/RTP/SAVPF 96", "a=mid:0", ""].join("\r\n");

describe("a stopped share's transceiver", () => {
  it("is stopped once it has been negotiated", () => {
    expect(stopping({ mid: "3", currentDirection: "sendonly" }, description("0 1 3"))).toBe("stop");
  });

  it("is left inactive when it carries the connection's transport, the BUNDLE group's first mid", () => {
    expect(stopping({ mid: "0", currentDirection: "sendonly" }, description("0 1 3"))).toBe("inactive");
    expect(stopping({ mid: "2", currentDirection: "sendonly" }, description("2 0 1"))).toBe("inactive");
  });

  it("finds the BUNDLE group among the others, with bare line feeds as well", () => {
    const sdp = "v=0\na=group:LS 1 2\na=group:BUNDLE 2 1\nm=video 9 UDP/TLS/RTP/SAVPF 96\n";
    expect(stopping({ mid: "2", currentDirection: "sendonly" }, sdp)).toBe("inactive");
    expect(stopping({ mid: "1", currentDirection: "sendonly" }, sdp)).toBe("stop");
  });

  it("is left inactive when its offer was never answered, with or without a mid", () => {
    expect(stopping({ mid: "11", currentDirection: null }, description("0 1"))).toBe("inactive");
    expect(stopping({ mid: null, currentDirection: null }, description("0 1"))).toBe("inactive");
  });

  it("is stopped on a connection that bundles nothing", () => {
    expect(stopping({ mid: "0", currentDirection: "sendonly" }, "v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n")).toBe("stop");
  });
});
