// The one Worker. Every request comes here first: the front end's built files are
// served as they are, and everything else goes to the instance, which decides what
// each visitor may see.

import { INSTANCE_NAME } from "../instance/instance.ts";
import { log } from "../instance/log.ts";
import { routeOf } from "../shared/log.ts";

// Only handlers and Durable Object classes may be exported from here; workerd refuses
// to start a Worker that exports anything else.
export { Instance } from "../instance/instance.ts";

// Where the build puts the front end's scripts and styles. They reveal nothing.
const BUILT_FILES = "/assets/";

// Paths the Vite dev server answers itself: source modules and its own client. They
// exist only under `pnpm dev`; the production build has none.
const VITE_DEV_PATHS = ["/@vite/", "/@id/", "/@fs/", "/src/", "/node_modules/"];

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (import.meta.env.DEV && VITE_DEV_PATHS.some((prefix) => pathname.startsWith(prefix))) {
      return env.ASSETS.fetch(request);
    }
    if (pathname.startsWith(BUILT_FILES)) {
      const file = await env.ASSETS.fetch(request);
      if (file.ok || file.status === 304) return file;
    }
    try {
      return await env.INSTANCE.getByName(INSTANCE_NAME).fetch(request);
    } catch (error) {
      // The instance could not be reached, or failed: its own line may never have been written.
      log.error("error", error, { during: "reaching the instance", method: request.method, route: routeOf(pathname).route });
      throw error;
    }
  },
} satisfies ExportedHandler<Env>;
