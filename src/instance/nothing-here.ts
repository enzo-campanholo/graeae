/**
 * The one answer for every refused address: the app's page, which shows "nothing here"
 * for any address it is not let into. Its status, headers and body carry nothing from
 * the request, so no two refusals can be told apart.
 */
export async function nothingHere(assets: Fetcher, request: Request): Promise<Response> {
  const page = await assets.fetch(new URL("/", request.url));
  return new Response(page.body, {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
