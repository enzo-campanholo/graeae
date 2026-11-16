# Plain Svelte single-page app, not SvelteKit

graeae's front end is a plain Svelte single-page app built with Vite and served as static assets by the same Worker that holds the Durable Object, so the whole app is one `wrangler deploy`. SvelteKit was the obvious choice and was rejected: its Cloudflare adapter generates the Worker itself and could not host a Durable Object (sveltejs/kit PR #17708 was unmerged on 2026-11-14), which would mean a second Worker, config and deploy for everyone who deploys their own instance. It also has no native WebSocket support, and server rendering buys nothing when every page sits behind the device cookie and a room is live state over a socket.

## Consequences

- The app brings its own small client-side router.
- Worth revisiting only if SvelteKit can host the Durable Object in a single Worker and the app gains pages that benefit from server rendering.
