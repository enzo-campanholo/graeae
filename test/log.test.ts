// The line builder, which both sides write every log line through: what it leaves out
// (the ticket's "Never logged") and what it keeps.

import { describe, expect, it } from "vitest";
import { LogBuffer } from "../src/app/lib/log-buffer.ts";
import { logLine } from "../src/shared/log.ts";

const SETUP_SECRET = "setup-secret-0123456789abcdefghijklmnop";
const DEVICE_TOKEN = "Zm9vYmFyYmF6cXV4cXV1eGNvcmdlZ3JhdWx0Z2FycGx5";
const INVITE_CODE = "aW52aXRlLWNvZGUtMTIzNA";
const APP_SECRET = "sfu-app-secret-9876543210";
const TURN_KEY_ID = "turn-key-id-abcdef0123";
const TURN_KEY_TOKEN = "turn-key-token-fedcba9876";
const RELAY_USERNAME = "1767225600:relay-user";
const RELAY_CREDENTIAL = "relay-credential-xyz";
const FRIEND_IP = "203.0.113.42";
const FRIEND_IPV6 = "2001:db8::42";

const SDP = [
  "v=0",
  `o=- 4611731400430051336 2 IN IP4 ${FRIEND_IP}`,
  "s=-",
  "t=0 0",
  "m=video 9 UDP/TLS/RTP/SAVPF 96",
  `c=IN IP4 ${FRIEND_IP}`,
  "a=mid:0",
  "a=sendonly",
  `a=candidate:842163049 1 udp 1677729535 ${FRIEND_IP} 50000 typ srflx raddr 10.0.0.2 rport 50000`,
  "m=audio 9 UDP/TLS/RTP/SAVPF 111",
  `a=candidate:1 1 udp 2122260223 ${FRIEND_IPV6} 50001 typ host`,
  "a=mid:1",
  "a=sendonly",
  "",
].join("\r\n");

const CANDIDATE = `candidate:3 1 udp 41885439 ${FRIEND_IP} 3478 typ relay raddr ${FRIEND_IP} rport 60000`;

/** Everything the ticket says must never be stored, each where a careless line would carry it. */
function everythingNeverLogged() {
  return {
    secret: SETUP_SECRET,
    body: { secret: SETUP_SECRET },
    cookie: `__Host-device=${DEVICE_TOKEN}`,
    headers: { Cookie: `__Host-device=${DEVICE_TOKEN}`, "set-cookie": `__Host-device=${DEVICE_TOKEN}` },
    token: DEVICE_TOKEN,
    invite: { code: INVITE_CODE, name: "Bia" },
    path: `/invite/${INVITE_CODE}`,
    url: `https://graeae.test/api/invites/${INVITE_CODE}`,
    note: `the owner pasted ${APP_SECRET} and ${TURN_KEY_TOKEN} under ${TURN_KEY_ID}`,
    message: {
      type: "media",
      change: {
        type: "connected",
        iceServers: [{ urls: ["turn:turn.example:3478"], username: RELAY_USERNAME, credential: RELAY_CREDENTIAL }],
      },
    },
    request: { type: "start", kind: "screen", offer: SDP, video: "0", audio: "1" },
    pulled: { type: "pulled", offer: SDP },
    answer: SDP,
    sdp: SDP,
    candidate: CANDIDATE,
    error: new Error(`setRemoteDescription failed on line a=candidate:1 1 udp 1 ${FRIEND_IP} 9 typ host`),
  };
}

const NEVER = [
  SETUP_SECRET,
  DEVICE_TOKEN,
  INVITE_CODE,
  APP_SECRET,
  TURN_KEY_ID,
  TURN_KEY_TOKEN,
  RELAY_USERNAME,
  RELAY_CREDENTIAL,
  FRIEND_IP,
  FRIEND_IPV6,
  "10.0.0.2",
];

describe("the line builder", () => {
  it("leaves out every secret, SDP body, candidate and address, on either side", () => {
    const secrets = [SETUP_SECRET, APP_SECRET, TURN_KEY_ID, TURN_KEY_TOKEN];
    for (const line of [
      logLine("instance", "test.everything", everythingNeverLogged(), { secrets }),
      logLine("tab", "test.everything", everythingNeverLogged(), { secrets }),
    ]) {
      const written = JSON.stringify(line);
      for (const value of NEVER) expect(written, value).not.toContain(value);
    }
  });

  it("leaves out everything a tab could hold, though a tab knows none of the instance's secrets", () => {
    // A tab never sees the media server's secret or the relay key, so nothing carries them here.
    const { note, ...fromATab } = everythingNeverLogged();
    void note;

    const written = JSON.stringify(logLine("tab", "test.everything", fromATab));

    for (const value of NEVER) expect(written, value).not.toContain(value);
  });

  it("keeps what a reader needs: the shared fields, offers by their tracks, candidates by type and protocol", () => {
    const line = logLine("tab", "share.asked", {
      member: "m1",
      device: "d1",
      tab: "t1",
      room: "abcdefghij",
      request: { type: "start", kind: "screen", offer: SDP, video: "0", audio: "1" },
      candidate: CANDIDATE,
      code: 1006,
      reason: "lost",
      error: new TypeError("no picture"),
    });

    expect(line).toMatchObject({
      source: "tab",
      event: "share.asked",
      member: "m1",
      device: "d1",
      tab: "t1",
      room: "abcdefghij",
      code: 1006,
      reason: "lost",
      request: {
        type: "start",
        kind: "screen",
        video: "0",
        audio: "1",
        offer: {
          bytes: SDP.length,
          media: [
            { mid: "0", kind: "video", direction: "sendonly" },
            { mid: "1", kind: "audio", direction: "sendonly" },
          ],
        },
      },
      candidate: { type: "relay", protocol: "udp" },
      error: { name: "TypeError", message: "no picture" },
    });
    expect((line.error as { stack?: string }).stack).toContain("TypeError: no picture");
  });

  it("leaves a known secret out wherever it turns up, even in a field it has no rule for", () => {
    const line = logLine("instance", "test.secret", { anything: `x${SETUP_SECRET}y` }, { secrets: [SETUP_SECRET] });

    expect(JSON.stringify(line)).not.toContain(SETUP_SECRET);
  });
});

describe("a tab's buffer of events", () => {
  it("keeps the newest events up to its cap, and counts those it dropped", () => {
    const buffer = new LogBuffer<number>(3);
    for (const event of [1, 2, 3, 4, 5]) buffer.add(event);

    expect(buffer.take(10)).toEqual({ events: [3, 4, 5], dropped: 2 });
    expect(buffer.take(10)).toBeNull();
  });

  it("gives back, oldest first, a batch whose way out failed, before what came after it", () => {
    const buffer = new LogBuffer<number>(10);
    buffer.add(1);
    buffer.add(2);
    const failed = buffer.take(10)!;
    buffer.add(3);

    buffer.putBack(failed);

    expect(buffer.take(10)).toEqual({ events: [1, 2, 3], dropped: 0 });
  });
});
