// Which media layer the instance uses. Only the fake exists so far: ticket 12 adds the
// Cloudflare implementation, makes it the default, and adds the switch that selects the
// fake for tests, which no request to a deployed instance can reach.

import { fakeMediaServer } from "./fake.ts";
import type { MediaLayer } from "./layer.ts";

export type { MediaConnectionId, MediaLayer, Track } from "./layer.ts";

export function mediaLayer(env: Env): MediaLayer {
  void env;
  return fakeMediaServer;
}
