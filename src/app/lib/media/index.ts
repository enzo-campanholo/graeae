// Which media client a tab uses. Only the fake exists so far: ticket 12 adds the real
// one, makes it the default, and adds the switch that selects the fake for tests.

import { FakeMediaClient } from "./fake.ts";
import type { MediaClient } from "./client.ts";

export type { Capture, MediaClient, Offer } from "./client.ts";

export function createMediaClient(): MediaClient {
  return new FakeMediaClient();
}
