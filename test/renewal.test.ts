// What a tab does with a fresh relay credential: on a direct path it takes it silently;
// on the relay it restarts its media connection, or, if the one switch says so, makes a
// new one the ordinary way.

import { describe, expect, it } from "vitest";
import { ON_THE_RELAY, renewal } from "../src/app/lib/media/renewal.ts";

describe("a fresh credential", () => {
  it("is taken silently on a direct path, whatever the switch says", () => {
    expect(renewal(false)).toBe("silently");
    expect(renewal(false, "restart")).toBe("silently");
    expect(renewal(false, "reconnect")).toBe("silently");
  });

  it("restarts a connection on the relay, as the switch ships", () => {
    expect(ON_THE_RELAY).toBe("restart");
    expect(renewal(true)).toBe("restart");
  });

  it("reconnects a connection on the relay once the switch is turned to a plain reconnect", () => {
    expect(renewal(true, "reconnect")).toBe("reconnect");
  });
});
