<a href="https://0rwx.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NamtaoProductions/0rwx.com/108078203f642cdfc03fdfdc98a0cdc1561e8fa3/static/AI-X-dark.svg">
    <img align="right" src="https://raw.githubusercontent.com/NamtaoProductions/0rwx.com/108078203f642cdfc03fdfdc98a0cdc1561e8fa3/static/AI-X-light.svg" width="40" height="40" alt="AI:X (Execute)">
  </picture>
</a>
<img src="assets/icon.svg" width="64" height="64" alt="">

# graeae

A private web app where a small group of friends shares screens and webcams with each other while Discord keeps the voice and the text.

One person, the **owner**, deploys an **instance** to their own Cloudflare account on the free plan and lets friends in with single-use invites. Nobody signs up or logs in: each browser that opens an invite is remembered as a device for 400 days from its last visit. Inside an instance are permanent rooms. In a room, members share a screen (with the sound of the tab or application shared, where the browser can capture it) and a webcam, and everyone else chooses what to watch. graeae never touches a microphone.

Every share goes through Cloudflare's media server in the owner's account. graeae counts what members watch and stops all watching when the month's usage budget runs out, so the expected cost is $0.

**Before you start, read [Cost](#cost), [Limits](#limits) and [No support](#licence-and-no-support).** graeae is 0BSD software with no warranty and no promise of support.

- [Cost](#cost)
- [Limits](#limits)
- [Platforms](#platforms)
- [Deploying](#deploying)
- [Updating](#updating)
- [Looking after an instance](#looking-after-an-instance)
- [Licence and no support](#licence-and-no-support)
- [Working on graeae](#working-on-graeae)

## Cost

- **Expected cost: $0.** The instance runs on Cloudflare's free Workers plan, and Cloudflare's media server and relay include 1,000 GB a month.
- **Cloudflare requires a card on file** before it turns on Realtime, the product that holds the media server and the relay.
- **The media server and the relay share the 1,000 GB.** Past it, Cloudflare charges $0.05 per GB, billed to the card automatically. Only what Cloudflare sends out counts; what members send in is free.
- **The usage budget defaults to 1,000 GB**, matching Cloudflare's included allowance. The owner sets it on the owner page, under Usage, with its dollar cost shown beside it. When usage reaches it, all watching stops until the month resets or you raise it. Shares stay live. Browsers report what they receive once a minute, so the count, its warnings and the stop run up to a minute behind.
- **The usage budget bounds what members watch, not the whole bill.** Relay traffic graeae never sees, such as a removed device using an unexpired relay credential, is not counted. **Set a budget alert in Cloudflare.** In the dashboard, go to Manage Account › Billing › Billable Usage and select **Create budget alert**. It emails you once a billing period when the account's usage-based spend passes the figure you set. It does not stop anything.
- **The usage count reads a little above Cloudflare's.** graeae counts the bytes each browser reports receiving. On a real 2 GB session the browsers' totals read 7.9% above Cloudflare's own figure, since browsers count packet overhead that Cloudflare leaves out. Watching through the relay is counted twice. Cloudflare says it bills relayed media once, so that reads well above the bill, but one session on the relay showed Cloudflare's media server sending more than the browser received, and Cloudflare's billing shows the media server and the relay as one figure, so it cannot tell which of the two it charges. The doubling stays: it errs high, the safe side for a budget.

What the 1,000 GB buys, by the estimate graeae was designed to: 30 hours a month with one screen and one webcam live, each watched by three people, comes to about 550 GB. A heavy night of four screens and four webcams, each watched by three, uses about 73 GB an hour.

## Limits

- Designed for a group of about 4 to 6, with at most 8 members present in one room at once. Access lists and the number of rooms are not limited.
- Four screens live at once at 1080p60 is the aim, but the load on a viewer's machine of decoding three or four game shares has not been measured.
- Plan on at least 20 Mbps of upload to share a screen at 1080p60. The browser adapts to a weaker connection; graeae does not switch the share to 720p or warn about low upload speed.
- One application's audio was isolated in a launcher test, but audio from a launcher-started game was not verified.
- Hardware encoding at 1080p60 has been proven on two recent NVIDIA graphics cards only. The effect of sharing on a game is unmeasured on a weaker machine.
- **The 144 Hz caveat:** on Windows, a sharer whose monitor runs at 144 Hz gets 48 fps instead of 60, until Chrome's fix for it ships. graeae notices and tells the sharer; setting the monitor to 120 Hz gives 60.
- No phone layout, no sharing from a phone, no voice or text chat, no recording.
- The instance runs on Cloudflare's free plan, as one Durable Object. A busy evening uses a small part of its daily allowances (about 11% of the rows written for ten tabs over eight hours). A second instance on the same account shares those allowances.

## Platforms

Three levels. **Supported**: the targets hold, and a failure is a bug. **Limited**: it works, with named gaps that are not bugs. **Best effort**: never blocked, never tested, no fix promised.

| Platform | Level | Watching | Sharing |
|---|---|---|---|
| Windows 11, current stable Chrome, Helium or Brave | Supported | Everything, with screen audio | Screen at 1080p60, webcam at 720p30, screen audio |
| Windows 11, current stable Firefox | Limited | Everything, with screen audio | Webcam. Screen is video only, with no quality promise; sending a screen share on Windows has not been verified |
| Windows 11, current stable Zen | Limited | Everything, with screen audio | Webcam. Screen sharing is video only and may send no picture; use Chromium to share a screen |
| Linux, current stable Chromium | Limited | Everything, with screen audio | A tab with its audio; a window or whole screen as video only; a webcam. No quality promise |
| Everything else | Best effort, untested | Whatever the browser can do | Whatever the browser can do |

"Everything else" is untested: macOS in any browser, Vivaldi, Edge, Opera and other Chromium browsers, Firefox and Zen off Windows, Windows 10, Safari, and every phone browser. graeae never checks the operating system and never blocks a browser. The 144 Hz caveat under [Limits](#limits) applies to the Supported level.

## Deploying

From an empty Cloudflare account to a working instance takes about half an hour. Everything you choose later (rooms, invites, the usage budget, the reset day) is set in the app; the only configuration is five secrets.

You need [Node.js](https://nodejs.org) 24, [pnpm](https://pnpm.io) 12 (`corepack enable pnpm` sets it up from Node.js), [git](https://git-scm.com), and a Cloudflare account with a card.

### 1. In the Cloudflare dashboard

Sign up at [dash.cloudflare.com](https://dash.cloudflare.com) if you have no account.

1. **Add a card and turn on Realtime.** Open **Realtime** in the dashboard. Cloudflare asks for a card before Realtime can be used.
2. **Create a media server application.** Go to **Realtime › Serverless SFU** and create an application. Keep its **App ID** and **App Secret** for the secrets file.
3. **Create a relay key.** In **Realtime**, open TURN and create a TURN key. Keep its **Turn Token ID** and **API Token** for the secrets file.

### 2. Clone and install

Check out the newest release, which is the newest tag. Its entry in [CHANGELOG.md](CHANGELOG.md) says whether it needs anything by hand.

```sh
git clone https://github.com/enzo-campanholo/graeae.git
cd graeae
git checkout "$(git describe --tags --abbrev=0 origin/HEAD)"
pnpm install --frozen-lockfile
```

### 3. Fill in the secrets file

```sh
cp .secrets.example .secrets
```

`.secrets` is ignored by git. Fill in all five values:

| Secret | What it is |
|---|---|
| `SETUP_SECRET` | Makes a browser the owner's device. At least 32 characters; generate one with the command below. |
| `SFU_APP_ID` | The media server application's App ID |
| `SFU_APP_SECRET` | The media server application's App Secret |
| `TURN_KEY_ID` | The relay key's Turn Token ID |
| `TURN_KEY_TOKEN` | The relay key's API Token |

Generate the setup secret with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

**Keep a copy of the setup secret in your password manager.** It is the owner's way back in after losing every device, and you are about to delete the file that holds it.

### 4. Deploy

```sh
pnpm exec wrangler login
pnpm run deploy
```

`wrangler login` opens a browser to sign in to Cloudflare once. `pnpm run deploy` builds graeae, uploads it with the five secrets, and prints the instance's address, `https://graeae.<your subdomain>.workers.dev`. A deploy with any secret missing fails and names it. A line left blank in `.secrets` is refused before anything is uploaded.

While it builds, a deploy prints a warning that the five secrets are missing and should be added to `.dev.vars`. Ignore it: the build checks for the secrets used to run graeae on your own computer, not the ones on the Worker. Only an error from the upload, after the build, means a secret is really missing.

Always deploy with `pnpm run deploy`. Do not run `wrangler deploy` yourself: it uploads whatever build is lying in `dist/`, and after the tests that is a build with no real media in it.

**Then delete `.secrets`.** The Worker keeps the secrets, and later deploys without the file leave them as they are. A secrets file left on disk is one more place for them to leak from.

```sh
rm .secrets
```

To run a second instance on the same Cloudflare account, give it its own name every time you deploy it, updates and secret changes included: `pnpm run deploy --name <other name>`. Its address is `https://<other name>.<your subdomain>.workers.dev`. A deploy without the name goes to the `graeae` Worker.

The instance keeps 3 days of logs (7 from 1 December 2026), for debugging, in your Cloudflare account's Workers Logs: what each page and the instance did, with members' display names but never a secret, an IP address or anything shared.

### 5. Open the setup address

Open `https://graeae.<your subdomain>.workers.dev/setup#<your setup secret>` in the browser you will use. That browser becomes the owner's first device, the first room is made, and you land in it. The part after `#` never leaves your browser in an address.

If the page says secrets are missing, the media server or relay is not set up: put the missing ones in a new `.secrets` (see [Rotating a secret](#rotating-a-secret)) and deploy again. If every share fails with "Your webcam share didn't start. Try again.", a media server or relay value is probably wrong. Check them in the dashboard and deploy the right ones the same way.

### 6. Set the reset day

Open the gear in the room's bar, then **Usage**. Set **Reset day** to the day your Cloudflare billing period starts (in the dashboard, Manage Account › Billing › Billable Usage shows the current billing period). The usage budget then runs over the same month as the bill. Raise the usage budget here too if you choose to pay for more than 1,000 GB.

### 7. Invite people

On the owner page, under **Invites**: type a display name, tick the rooms, and press **Create and copy link**. Paste the link to that person, in Discord for example. An invite works once, for 7 days; it is only used up when they press the button on its page, so a chat app's link preview cannot spend it.

### Optional: a custom hostname

graeae runs on its `workers.dev` address; you need no domain. To add your own hostname, your domain must be on Cloudflare. In the dashboard, go to **Workers & Pages**, pick the `graeae` Worker, then **Settings › Domains & Routes › Add › Custom Domain**, type the hostname, and select **Add Custom Domain**. Cloudflare makes its DNS record. Do not add it to `wrangler.jsonc`: the repo's config names no routes, so nobody edits a tracked file. Later deploys leave the hostname in place.

The `workers.dev` address keeps working beside it. Browsers are remembered per address, so a device remembered on one address is a stranger on the other. Add the hostname before you invite anyone. If people are already in, open the setup address on the new hostname, then let each member back in from the owner page there (**People**, pick the member, **Let back in**) and send them the new link.

## Updating

```sh
git fetch --tags
git checkout "$(git describe --tags --abbrev=0 origin/HEAD)"
pnpm install --frozen-lockfile
pnpm run deploy
```

Read the release's entry in [CHANGELOG.md](CHANGELOG.md) first: a release that needs a step by hand says so there. You need no secrets file; the Worker keeps its secrets. For a second instance, add `--name <other name>` to the deploy.

You can deploy while people are watching. Cloudflare holds the new release back for up to 5 minutes while a room is busy, so pages already open can keep showing the old one until then. When the switch comes, open pages reconnect in under a second, and what people share and watch carries on.

Changes to stored data are applied by the instance itself, the first time it starts after the deploy. Members, devices, rooms and settings are kept. **Going back to an older release is not supported** once a newer one has run: changes to stored data only go forward, and an older release is not made to read data a newer one has changed.

## Looking after an instance

### Getting back in as the owner

If you lose every device, or one is stolen, open `/setup#<your setup secret>` in any browser. That browser becomes an owner device and every other owner device is forgotten, so a thief is locked out too. Members' devices are not touched.

If you have lost the setup secret as well, set a new one (below) and use that.

### Rotating a secret

To replace secrets, write a `.secrets` that holds only the lines you are changing, deploy, and delete the file again:

```sh
cp .secrets.example .secrets   # then delete every line you are not changing
pnpm run deploy
rm .secrets
```

Secrets left out of the file keep their values on the Worker. For a second instance, add `--name <other name>` to the deploy.

- **`SETUP_SECRET`**: generate a new one with the command under [step 3](#3-fill-in-the-secrets-file). The old one stops working at once. Owner devices stay remembered.
- **`SFU_APP_ID` and `SFU_APP_SECRET`**: create a new media server application under Realtime › Serverless SFU, deploy both of its values together, then delete the old application. Do this when nobody has a room open: shares and watching on the old application end when it goes.
- **`TURN_KEY_ID` and `TURN_KEY_TOKEN`**: create a new TURN key under Realtime, TURN, deploy both of its values together, then delete the old key. Open tabs get a credential from the new key at their next renewal, within 11 hours, or sooner if they reconnect.

### Emergency stop for relay abuse

graeae cannot see relay traffic, and a removed member's browser may hold a relay credential for up to 12 hours. If the relay figures in the dashboard climb with nobody watching, replace the relay key: create a new one, deploy it as under [Rotating a secret](#rotating-a-secret), and delete the old one. **It is unverified whether deleting the key ends the credentials already issued from it.** Each one expires 12 hours after it was issued in any case.

### Deleting an instance

```sh
pnpm exec wrangler delete
```

This deletes the `graeae` Worker (add `--name <other name>` for a second instance). Cloudflare describes it as deleting the Worker and all its associated resources: the instance's address, and the Durable Object that holds its members, devices, rooms and usage. It also removes a custom hostname, if you added one, and its DNS record. It may warn that it could not check for Container applications; graeae deploys none, so ignore it. Then, in the dashboard, delete the media server application and the TURN key.

### No backup

There is no export and no backup. If an instance's stored data is lost, open the setup address again: it makes a fresh owner and first room. Then recreate the other rooms and invite everyone again. Room addresses change, so share the new links.

## Licence and no support

graeae is released under the [0BSD licence](LICENSE): do anything you like with it. It comes with **no warranty** of any kind, and **no promise of support**. Issues and pull requests are open, but they may go unanswered. You run your instance, and answer for its bill, yourself.

Changes from release to release are in [CHANGELOG.md](CHANGELOG.md).

## Working on graeae

Development notes for contributors are in [CLAUDE.md](CLAUDE.md), the terms the code uses in [GLOSSARY.md](GLOSSARY.md), and the decisions behind it in [docs/adr](docs/adr). In short:

- `pnpm dev:fake-media` runs the whole app locally on fake media, with the five secrets in a git-ignored `.dev.vars` (any values; a setup secret of 32 characters or more). `pnpm dev` runs it on the real media server, so sharing needs real secrets there.
- `pnpm test` builds a test version and runs every test on the fakes; nothing automated talks to Cloudflare. `pnpm typecheck` and `pnpm lint` check the rest.
