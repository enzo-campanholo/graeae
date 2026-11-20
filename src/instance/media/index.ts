// Which media layer the instance uses: Cloudflare's media server and relay, or the fake
// media server in a build made for tests. The switch is fixed when the code is built
// (`src/shared/fake-media.d.ts`), so no request to a deployed instance can select the
// fake, and a build for deploying does not contain it.

import { CloudflareMediaServer } from "./cloudflare.ts";
import { fakeMediaServer } from "./fake.ts";
import type { MediaLayer } from "./layer.ts";
import { logged } from "./logged.ts";

export type { MediaConnectionId, MediaLayer, Pulled, Track } from "./layer.ts";

/** The media layer, with every call written to the logs (`logged.ts`). */
export function mediaLayer(env: Env): MediaLayer {
  return logged(__GRAEAE_FAKE_MEDIA__ ? fakeMediaServer : new CloudflareMediaServer(env));
}
