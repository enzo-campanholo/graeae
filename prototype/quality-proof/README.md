# PROTOTYPE: quality proof

Throwaway. It answers the Quality proof ticket (`.scratch/v1/issues/13-quality-proof.md` on main): does Cloudflare's media server deliver 1080p 60fps gameplay between the group's real machines? Nothing here is production code.

## Run it

```sh
./run.sh
```

It deploys one Worker named `graeae-quality-proof` to your Cloudflare account, asks for the media server application's ID and secret (and, optionally, a relay key), and prints a link containing an access key. Send that link to whoever is testing.

When the proof is done:

```sh
./run.sh delete
```

## What it is

- `public/index.html`: one page. Share a screen with a chosen codec and bitrate, watch any live share, and read the browser's own statistics every 2 seconds. The test plan is at the bottom of the page.
- `src/worker.js`: checks the access key, makes every media server call with the application secret, and keeps the list of live shares in memory. Statistics from every browser are logged in the Durable Object's storage; "Download log" returns all of it as JSON.

## How it differs from what v1 will build

- Each share and each watched share uses its own connection. v1 will likely use one connection per member.
- The access key is one shared string in the URL. There are no members, devices or rooms.
- Anyone with the link can cut anyone's share. That button is the removal test.
