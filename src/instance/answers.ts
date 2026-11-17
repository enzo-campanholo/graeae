// The instance's answers. A page is always the same app page, which shows what belongs
// at its address; only the status says whether the visitor was let in.

/**
 * The one answer for every refused address: the app's page, which shows "nothing here"
 * for any address it is not let into. Its status, headers and body carry nothing from
 * the request, so no two refusals can be told apart.
 */
export async function nothingHere(assets: Fetcher, request: Request): Promise<Response> {
  return appPage(assets, request, 404);
}

/** The app's page for an address the visitor is let into. */
export async function page(assets: Fetcher, request: Request): Promise<Response> {
  return appPage(assets, request, 200);
}

export function json(body: unknown): Response {
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

export function redirect(to: string): Response {
  return new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store" } });
}

async function appPage(assets: Fetcher, request: Request, status: number): Promise<Response> {
  const app = await assets.fetch(new URL("/", request.url));
  return new Response(app.body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/** The answer to an action that has nothing to say but that it was done. */
export function done(): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
