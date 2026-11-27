# Remembered-device access

Type: research
Status: resolved
Branch: research/device-access
Map: ../map.md

## Question

Which mechanisms let a member be set up once and then open the URL with no login screen for months, while the owner can still revoke them?

Compare from primary sources:

- An invite link that sets a long-lived credential in the browser (cookie or stored key).
- Passkeys (WebAuthn).
- Cloudflare Access on the free plan, including its seat limit and maximum session length.
- Sign-in with Discord, since every member already has an account there.

For each, report: how long a browser stays signed in without any prompt in Chromium and in Firefox (cookie lifetime caps, storage clearing, tracking protection), what happens when a member uses a second device or clears their browser, how revocation works, what the owner has to run or configure, and what it asks of someone deploying their own copy.

The answer feeds [Getting in](10-getting-in.md).

## Answer

Full findings: `docs/research/device-access.md`, read from primary docs on 2026-11-15.

- **Invite link that sets a cookie.** Silent for up to 400 days in Chrome, and the server can push the expiry out again on every visit, so a regular member never sees a prompt. Firefox's tracking protection does not touch a first-party cookie. A "delete data on close" setting or clearing the browser ends it. A second device or a cleared browser needs a new invite, so recovery while the owner is absent is the open design question. Revocation is a server-side delete that takes effect on the next request. Lowest setup burden: no third party and no domain restriction.
- **Passkeys.** Never silent: the WebAuthn spec requires an authorization gesture, so there is always a Windows Hello-style dialog. A passkey can re-establish a session in one dialog and survives clearing the browser, but it does not replace the session cookie. Needs a WebAuthn library and an identifier tied to the domain.
- **Cloudflare Access on the free plan.** 50 users at no cost. Login by emailed one-time code, passkey, Google or GitHub. The maximum session is 1 month, after which the member is sent back through the login method. Revocation takes up to 1 minute. The domain must be an active Cloudflare zone, which is the heaviest lock-in of the four.
- **Sign-in with Discord.** The app's own cookie does the silencing. After it expires, the return trip is two redirects with no consent screen. Each person deploying their own copy must create a Discord application. Members who only use the Discord desktop app may have no Discord web session, which is a risk.

Unverified: Firefox's lifetime cap on cookies set by a website, Firefox's delete-on-close behaviour (Mozilla's support pages could not be fetched), whether passkeys sync between Windows PCs, whether Cloudflare Access covers WebSockets, whether Discord works as a Cloudflare Access identity provider, and Discord's refresh-token lifetime. The findings file lists 12 unverified items in its section 8.
