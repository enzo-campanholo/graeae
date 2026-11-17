// Which media client a tab uses: the real one, or the fake in a build made for Seam 2.
// The switch is fixed when the app is built (`src/shared/fake-media.d.ts`), so a build
// for deploying does not contain the fake.

import { BrowserMediaClient } from "./browser.ts";
import { FakeMediaClient } from "./fake.ts";
import type { MediaClient } from "./client.ts";

export type { Capture, MediaClient, Offer } from "./client.ts";

export function createMediaClient(): MediaClient {
  return __GRAEAE_FAKE_MEDIA__ ? new FakeMediaClient() : new BrowserMediaClient();
}
