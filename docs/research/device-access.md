# Remembered-device access: how a member gets in once and stays in

Ticket: which mechanisms let a member be set up once, then open the URL with no login screen for months, while the owner can still revoke them?

Status: research findings only. This note lays out facts and trade-offs and **does not choose**.
Every source below was read on **2026-11-15**. Quotes are from the page as read that day. Anything I could not confirm from a primary source is marked **UNVERIFIED**, and the list is collected at the end.

## 1. Short version

All four options end the same way for the "no login screen" goal. The browser holds a **first-party cookie on a domain the owner controls** (or, for Cloudflare Access, on Cloudflare's domains in front of it), and the server checks it. The options differ in how that cookie is first obtained, how it is recovered when it is lost, and who can switch it off.

| | Invite link + cookie | Passkey | Cloudflare Access (Free) | Sign in with Discord |
|---|---|---|---|---|
| Longest documented silent period | Up to **400 days** per Chromium and the draft cookie spec; the cap can be pushed out again on each visit. Firefox cap **UNVERIFIED** | A passkey is **never silent**; it always needs a user gesture and a system dialog. Once logged in, the session cookie is silent for whatever the app sets | **1 month maximum** (global session and application session) | The app's own session cookie, so same as the first column. Discord is only the way back in once that cookie is gone |
| Visible prompt on return after expiry | None possible until the cookie is gone; then the invite must be re-issued | Browser or OS passkey dialog, e.g. Windows Hello | Access login page or a redirect to the IdP. For OTP: type an emailed code | Redirect to Discord and back; no screen if the Discord web session exists and the app is already authorised (`prompt=none`). Needs a browser Discord session: **UNVERIFIED** |
| Second device | Needs its own invite | Passkey must exist on that device or be used cross-device | Separate login per browser | Works wherever the member can sign in to Discord |
| Cleared browser data | Needs a new invite | Passkey survives (it lives in the authenticator); session cookie does not | Re-login | Re-login via Discord |
| Revocation | Delete the server-side record; effective on the next request | Delete the credential and revoke the session; effective on the next request | Revoke the user in the dashboard; up to **1 minute** | Delete the app session and/or kick from the Discord server; the member can also remove the app in Discord |
| Owner runs | The app's own database | App's own database and a WebAuthn library | Cloudflare Zero Trust org, Access app, policy, IdP; tunnel recommended | A Discord application (client ID and secret); the app's own database |
| Deployer burden | Lowest; no third party | Low to medium | Highest and Cloudflare-specific; the domain must be an active Cloudflare zone | Medium; every deployer registers their own Discord app |

## 2. Cross-cutting browser facts

These apply to every option that relies on a cookie.

### 2.1 Cookie lifetime caps

- **Spec.** In the IETF draft *Cookies: HTTP State Management Mechanism* (`draft-ietf-httpbis-rfc6265bis-22`, dated 1 December 2025; its datatracker page lists the draft expiring 4 June 2026 and I found no RFC number, so RFC 6265 is still the published standard), §5.5 says: "The limit SHOULD NOT be greater than 400 days (34560000 seconds) in the future." It also says values above the limit "MUST be reduced to the limit." Source: <https://datatracker.ietf.org/doc/draft-ietf-httpbis-rfc6265bis/>
- **Chrome.** The Chrome developer blog says "cookies can no longer set an expiration date more than 400 days in the future". It shipped in Chrome **M104** (August 2022). Cookies that ask for more get 400 days instead of being refused. The cap applies to `Expires` and `Max-Age`; session cookies are unaffected. The 400 days count from when the cookie is set, so a site can push the expiry out again by setting a new cookie with the same name when the user returns. Source: <https://developer.chrome.com/blog/cookie-max-age-expires>
- **Edge, Brave and other Chromium browsers:** not separately checked. **UNVERIFIED** as inheriting the Chrome cap.
- **Firefox.** I found no documented 400-day cap for ordinary web cookies. What is documented is narrower: Firefox 142 release notes say "Updated the expiry value of all the cookies set via WebDriver BiDi and WebDriver classic (Marionette) to be limited to 400 days" (Bugzilla 1974394, <https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/142>). Bug 1973024 adds `nsICookieManager::maybeCapExpiry` "meant for use in the devtools and extensions". Whether Firefox caps `Set-Cookie` from web pages is **UNVERIFIED**. Also note that Bugzilla 1974394 writes "400 days (23040000 seconds)"; 400 days is 34,560,000 seconds, so the bug text has an arithmetic slip.
- **Evictions the cap does not cover.** The same draft says browsers may drop cookies early: "user agents often evict cookies due to memory pressure or privacy concerns", and over the per-domain or total limits they evict in a priority order, oldest last-access first within a priority. (draft §3.1, §4.1.2, §5.7)

### 2.2 First-party cookies and tracking protection

- **Firefox state partitioning and the storage access policy** concern third-party embeds. MDN: "Origins classified as trackers will have access to their own storage when they are loaded in a first-party context." The policy page describes no clearing or capping of first-party cookies. Sources: <https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Storage_Access_Policy>, <https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/State_Partitioning>
- **Firefox redirect-tracking purge** clears cookies and storage only for origins that are "classified as a tracker in our Tracking Protection list", and not for any origin the user has interacted with in the last 45 days (scrolling counts). It only runs if the user blocks tracking cookies, at most once per 24h and only when idle. The page says it "has since been superseded by bounce tracking mitigations". An app on the owner's own domain would not be on the tracker list. Source: <https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Redirect_tracking_protection>
- **Bounce tracking mitigations** (MDN): sites that a navigation was redirected *through* get flagged. A flagged site's cookies and storage are deleted if it has had no user interaction in 45 days **and** third-party cookies are blocked. Chrome shipped it in 116 and notes that Chromium has third-party cookies disabled by default "only when in Chrome Incognito mode". Firefox applies it in Enhanced Tracking Protection strict mode; it moved to "stateless mode" in Firefox 145. MDN also says the browser must not break SSO flows, and "doesn't name a special exemption". See §5.5 for why this matters to a Discord redirect. Source: <https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Bounce_tracking_mitigations>

### 2.3 "Clear on close" settings

- **Chrome:** Settings > Privacy and security > Site settings > Additional content settings > On-device site data has the option "Delete data sites have saved to your device when you close all windows". Google says sites "are less likely to recognize you between visits". Whether a per-site exception list exists is **UNVERIFIED** (the page I read did not show one). Source: <https://support.google.com/chrome/answer/14114868>
- **Firefox:** the enterprise policy `SanitizeOnShutdown` has a `Cookies` field and a `Sessions` ("Active Logins") field, and the older `ExpireAtSessionEnd` is deprecated in favour of it. Source: <https://mozilla.github.io/policy-templates/>. The user-facing "Delete cookies and site data when Firefox is closed" setting is real in my experience, but Mozilla's support pages returned a client-challenge page to my fetcher, so it is **UNVERIFIED from a primary source**.
- Either setting wipes every option below that relies on a cookie or browser storage, including a Cloudflare Access cookie. A passkey (kept in the authenticator, not in the browser store) is unaffected. Members who set these are outside what the owner can control.
- A cookie without `Expires` or `Max-Age` is a session cookie, removed "when the client shuts down". MDN adds that session restore can bring session cookies back. Source: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie>

### 2.4 Cookie vs. browser storage for holding a key

- MDN: default "best-effort" storage "persists as long as the origin is below its quota, the device has enough storage space, and the user doesn't choose to delete the data". Under pressure browsers evict the least recently used origin, and eviction is all-or-nothing for an origin.
- `navigator.storage.persist()` makes storage "only evicted, or deleted, if the user chooses to". Chromium browsers and Safari "automatically approve or deny the request based on the user's history of interaction with the site and do not show any prompts". In Firefox "the user is notified with a UI popup". Source: <https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria>
- Safari (not a stated target, since members are on Windows): script-written data is deleted after 7 days without interaction; "Cookies set by server are exempt". This favours server-set cookies over a key kept in `localStorage` if a Mac or iOS member ever joins. Same source.
- The 400-day cap is a cookie rule. A key in storage has no such cap, but the eviction rules above apply to it.

### 2.5 Cookie attributes worth knowing (MDN, same Set-Cookie page)

- `HttpOnly` stops page scripts from reading the cookie; `Secure` limits it to https; the `__Host-` prefix requires `Secure`, no `Domain`, and `Path=/`.
- `SameSite=Strict` sends the cookie "only for requests originating from the same site that set the cookie". By the MDN definition, a click on the app URL from Discord (a different site) is a cross-site navigation, so a `Strict` cookie would not accompany that first request. `Lax` does send it on top-level navigations. This is my reading of the definition, not a statement MDN makes about Discord links.

## 3. Option A: invite link that sets a long-lived credential

### What it is
The owner generates a one-time invite URL. The member opens it once per device. The server records a new device (a random token, stored hashed), and replies with `Set-Cookie`. Alternatively the page stores a key in `localStorage` or IndexedDB and sends it on later requests. This option is a design, not a product, so the facts below are the browser rules in §2.

### How long it stays silent
- **Chromium:** at most 400 days, renewable on each visit by re-setting the cookie (§2.1).
- **Firefox:** no documented web-cookie cap (**UNVERIFIED**); no tracking-protection clearing of first-party cookies on an ordinary site (§2.2).
- Ended early by: the member clearing data, "clear on close" settings (§2.3), cookie quota eviction (§2.1), or private windows.
- A key in storage is subject to eviction (§2.4); a server-set cookie avoids Safari's 7-day rule.

### Second device or cleared browser
Each is a new, unauthenticated browser. Unless the owner issues another invite, or the first browser can mint an invite for the second, the member cannot get back in. The "owner not present" requirement therefore means members need a way to recover without the owner, or the owner must issue invites ahead of time. **This is the main design question for this option.**

### Revocation
Entirely under the app's control: delete or flag the device record and the next request fails. There is no external dependency, so effect is as fast as the app checks. Per-device revocation is natural because each device has its own token record.

### What the owner runs
The app itself and its database; nothing else. Nothing from a third party.

### Deployer burden
Lowest of the four: no account at another service and no domain restriction. Trade-offs the design must handle (not facts from a source): an unredeemed invite link is a bearer secret and can leak through chat history or link previews; whether an invite is single-use; and how a device token is protected if the browser profile is copied.

## 4. Option B: passkeys (WebAuthn)

### Can a passkey be used with no visible prompt?
**No, per the specification.** The W3C Recommendation *Web Authentication Level 3* (25 August 2026) says, in §5.1.4: "Since this specification requires an authorization gesture to create any assertions". It also says a ceremony "includes a test of user presence or user verification". Source: <https://www.w3.org/TR/webauthn-3/>. I read about 300,000 of its 502,000 characters; §13 and §14 (security and privacy) were not read.

- MDN `CredentialsContainer.get()` defines `mediation: "silent"` as "The user will not be asked to authenticate... If consent is required, the promise will fulfill with `null`." Combined with the spec's gesture requirement, a passkey request cannot be made silently. This is my inference; MDN does not say how `silent` interacts with `publicKey`. Source: <https://developer.mozilla.org/en-US/docs/Web/API/CredentialsContainer/get>
- **Conditional mediation** shows passkeys in an autofill dropdown instead of a modal, but the user still picks an account and verifies. Chrome's docs: the user "picks an account" and uses "the device screen lock to sign in". Source: <https://developer.chrome.com/docs/identity/webauthn-conditional-ui>
- **Immediate mediation** is an *explainer*, not a standard. It "fails promptly if no credentials are immediately available", but when credentials exist "the browser presents the required UI to the user for authentication" and the user must confirm. The option shape changed from `mediation: 'immediate'` to `uiMode: 'immediate'` (explainer dated 02-04-2026). Chrome ran an origin trial. Firefox status: **UNVERIFIED**. Sources: <https://github.com/w3c/webauthn/blob/main/explainers/immediate-mediation.md>, <https://developer.chrome.com/blog/webauthn-immediate-mediation-ot>
- Whether `navigator.credentials.get()` needs transient user activation: MDN states no such requirement, and the part of the spec I read has it only for `create()` in cross-origin frames. **UNVERIFIED** either way for top-level `get()`.
- On Windows the private key "can only be used after [it is] unlocked by the user using the Windows Hello unlock factor (biometrics or PIN)". From Windows 11 24H2 there is also a per-application "passkey privacy consent" prompt, and declining it makes passkey registration and authentication fail. Source: <https://learn.microsoft.com/en-us/windows/security/identity-protection/passkeys/>

So a passkey is a fast, phishing-resistant way to **re-establish** a session (one dialog), not a way to have no login screen. To keep "open the URL and watch" it would still be combined with a session cookie, and the §2 limits apply to that cookie.

### Second device or cleared browser
- The credential is kept by the authenticator or platform (Windows Hello, a password manager, a phone), not by the browser, so clearing browser data does not delete it.
- Microsoft says "a passkey from one device can be used to sign in on another device", via a companion device with Bluetooth and internet on both. Sync between Windows PCs, or through Firefox or third-party managers: **UNVERIFIED** (not read).
- A new device with no synced passkey needs a new registration, which itself needs some other way in (an invite) first.

### Revocation
The relying party stores the public key. Deleting that record makes the next sign-in fail immediately. The existing session cookie must be revoked separately. The spec's signal methods (`signalUnknownCredential`, `signalAllAcceptedCredentials`) let a site tell authenticators which credentials to hide or remove ("potentially irreversibly"). They are optional signals that depend on the authenticator honouring them; I did not verify which Windows or browser combinations do.

### Owner and deployer burden
A WebAuthn server library, a credential table, and an RP ID tied to the app's domain (that a domain change invalidates passkeys is a property I believe the spec has, but I did not read the RP ID section: **UNVERIFIED**). No third party. Windows 11's consent prompt and the "must support discoverable credentials and user verification" authenticator requirement (stated for Cloudflare Access) may confuse members.

## 5. Option C: Cloudflare Access (Zero Trust Free)

Cloudflare Access is an identity-aware proxy in front of the app, so the app never shows its own login.

### Plan and seats
- Cloudflare's SASE / Zero Trust pricing page lists Free as "Teams under 50 users or enterprise proof-of-concept tests", price "$0", "50 users". It includes ZTNA (Access) and support is "Community forums + Discord", log retention "Up to 24 hours". The page says nothing about a credit card. Source: <https://www.cloudflare.com/plans/sase-zero-trust.md>
- Seats: "A user consumes a seat when they perform an authentication event", holds it "until you remove the user", and one seat covers all applications. When the plan's seats are used, "additional users who attempt to log in are blocked". The page does not mention Free by name. Source: <https://developers.cloudflare.com/cloudflare-one/team-and-resources/users/seat-management/>
- 4 to 6 members and the owner fit well inside 50.
- The account-limits page lists 50 custom applications on Zero Trust Free but no user cap, which is why the pricing page is the source for the 50. Source: <https://developers.cloudflare.com/cloudflare-one/account-limits/>

### Login methods
- **One-time PIN by email:** a code expires "10 minutes after the initial request", is single-use, and "Cloudflare only sends the email if the user is allowed by an Access policy." Mail security tools can consume it first. Source: <https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/>
- **Social:** Google ("without a Google Workspace account") and GitHub have their own pages. Source: <https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/>, `.../github/`.
- **Discord is not named.** The generic OIDC page does not mention Discord; it requires an authorization, token and `jwks_uri` endpoint. Whether Discord can be wired in through generic OIDC: **UNVERIFIED**. Source: `.../identity-providers/generic-oidc/`
- **Passkeys** are an identity provider option, requiring discoverable credentials and user verification. They "require interaction": the user must "complete your authenticator's verification prompt", though an optional auto-prompt setting opens the browser prompt for returning users. The docs don't say which plans include passkeys (**UNVERIFIED** for Free). Source: `.../identity-providers/passkeys/`

### Session length and what the user sees at expiry
- Global session: "between 15 minutes and one month", default 24 hours. Application session: "immediate timeout to one month", default 24 hours. **Maximum for every type: one month.** Source: <https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/>
- When the application token expires: "Cloudflare will automatically issue a new application token if the global token is still valid", and policies are rechecked. If the global token has also expired, "the user will be prompted to re-authenticate with the IdP."
- With one IdP allowed, "Apply instant authentication" means "End users will not be shown the Cloudflare Access login page" and users are redirected "directly to your SSO login event". Source: <https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/>. Whether this applies to the one-time PIN method is **UNVERIFIED**.
- So the expected re-auth experience is: redirect to Cloudflare, then to the IdP (silent if the IdP already has a browser session), then back; or with OTP, an email and a typed code. At worst that is roughly once a month per browser.
- For app requests made by script, an expired token blocks sub-requests; adding `X-Requested-With: XMLHttpRequest` returns a `401` the page can react to.
- Cookie: `CF_Authorization` (JWT). Team domain cookie is `HttpOnly` with `SameSite=None`; the application cookie is "Admin choice (Default: None)". There is an optional binding cookie. Source: <https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/>

### Second device or cleared browser
Each browser logs in separately and takes no extra seat (a seat is per user). A cleared browser means re-login through the IdP or OTP.

### Revocation
- Per user: Team & Resources > Users > Action > Revoke. "Access can immediately revoke a single user session across all applications." Per application: "Revoke existing tokens."
- Speed: after an admin revoke the user cannot log in again "for up to 1 minute"; after a user logout, tokens stop "in 20-30 seconds".
- To block permanently, remove the user from the policy or disable them at the IdP; a revoked user can start a new session "if their profile in your identity provider is still active". Policy identity is rechecked at session expiry, so revoke plus removal is the stated route to an immediate cut-off.
- Same session-management page as above.

### What the owner runs and configures
A Zero Trust organization, an Access application and Allow policy (selectors named in the docs include Emails, Emails ending in, Login Methods, Everyone), the chosen IdP, and session durations. A Cloudflare Tunnel is "the recommended way to connect the origin"; if the origin is publicly routable, the origin must be shielded and tokens validated ("You must validate the Access application token at the origin"). Source: self-hosted public app page.

### Deployer burden
- "An active domain on Cloudflare" is a stated prerequisite for a public self-hosted app, as a full or partial (CNAME) setup. A stranger whose DNS is elsewhere can use partial setup, with a CNAME to `<HOSTNAME>.cdn.cloudflare.net`; the zone apex needs CNAME flattening.
- This makes the app Cloudflare-dependent, against the stated goal of not locking in Cloudflare. It also means the app cannot be self-contained for someone not on Cloudflare.
- Whether Access covers WebSockets and whether Access is on the path for WebRTC signalling or media: **UNVERIFIED**. The pages I read do not mention WebSockets or WebRTC; the docs describe Access as protecting "web applications".
- Whether Zero Trust sign-up requires a payment card: **UNVERIFIED** (Cloudflare's page is silent; a third-party aggregator claims none).

## 6. Option D: Sign in with Discord (OAuth2)

### What the docs describe
Source for everything in this section: <https://docs.discord.com/developers/topics/oauth2> (the old `discord.com/developers/docs/...` URL answers 301).

- **Flow:** authorization code grant; the app exchanges the `code` at the token URL. Credentials are HTTP Basic or `client_id`/`client_secret` in the body.
- **`prompt` parameter:** `consent` re-asks even if already authorised; `none` "will skip the authorization screen" and sends the user straight to the redirect URI. This is the "silent return" lever.
- **Tokens:** `expires_in` is in seconds; the sample shows `604800` (7 days). A refresh token is used with `grant_type=refresh_token`. The page gives no refresh-token lifetime (**UNVERIFIED**).
- **Scopes:** `identify` (no email), `guilds`, `guilds.members.read` ("a user's member information in a guild").
- **Revocation endpoint:** `POST https://discord.com/api/oauth2/token/revoke`; revoking any one token revokes "any active access or refresh tokens associated with that authorization".
- **Redirect URI:** "whatever URL you registered when creating your application".
- **Approval:** "Some scopes require approval from Discord to use". Which scopes this covers beyond partner-only ones such as `rpc`, `voice` and `identify.premium` is **UNVERIFIED**; I did not find `identify` or `guilds` flagged.

### How silent the returning flow is
The app's own session cookie (§2) is what keeps the member in. Discord matters when that cookie is gone or expired. Then the app redirects to `https://discord.com/oauth2/authorize` with `prompt=none`; if the member is already authorised, Discord sends them straight back with a `code`. That is two redirects and no screen.

What the docs **do not** say, and what decides how silent this really is:
- Whether Discord needs the member to be logged in to **discord.com in that browser**. I assume it does (the authorize page uses that session), but the docs do not state it. **UNVERIFIED.** Members who only use the Discord desktop or phone app may have no web session at all, and first-time web login would then be a visible step.
- What Discord does when `prompt=none` is used and the user is not logged in or not yet authorised. **UNVERIFIED.**
- Bounce tracking: the redirect goes app → `discord.com` → app. Under the mitigations in §2.2, discord.com is the site the navigation bounced through. If it has had no user interaction in 45 days and third-party cookies are blocked (Firefox strict mode; Chrome only in Incognito by default), its stored state may be deleted, which could log the member out of Discord on the web. This is my application of MDN's description, not a documented Discord case.

### Second device or cleared browser
Works anywhere the member can sign in to Discord and the app can redirect there; each browser gets its own app session cookie. There is no per-device setup by the owner.

### Revocation
- The app can delete its session records (as fast as it checks).
- Because every member is already on the friend group's Discord server, "access = membership" could be checked with `guilds` or `guilds.members.read`, or by a bot. Removing someone from the server would then end their access at the next check. This is a design inference, not stated by Discord, and it depends on the app holding a usable token or a bot.
- The member can revoke the app on Discord's side; the app can revoke tokens using the endpoint above.

### What the owner runs and configures
A Discord application with client ID, client secret and a registered redirect URI. The app needs an `https` redirect handler and secret storage.

### Deployer burden
Every deployer must create their own Discord application, and the README must walk through it. Members need Discord accounts (the ticket says all do). The app depends on Discord's availability and policy changes. There is no domain restriction. Rate limits and terms of use for apps used only inside a small group: not read, **UNVERIFIED**.

## 7. Things that do not decide between the options

- **Same cookie underneath.** Options A, B and D all end in the app's own session cookie, so the §2 limits (400 days, clear-on-close, eviction) apply equally. Cloudflare Access has its own cookie with a one-month ceiling.
- **Second-device recovery and "owner not present".** Every option needs a story for the first login on a new device and for a cleared browser; they differ in who has to be online. A: the owner (or an existing device). B: a registered passkey, otherwise the owner. C: nobody, if the IdP or email works. D: nobody, if the member can sign in to Discord.

## 8. Unverified items, collected

1. Whether Firefox caps web-set `Set-Cookie` lifetimes at 400 days; only a WebDriver-scoped cap is documented (Firefox 142).
2. Whether Edge, Brave and other Chromium browsers follow Chrome's 400-day cap.
3. The Firefox user setting "Delete cookies and site data when Firefox is closed" and its exceptions (Mozilla support pages did not load; only the enterprise policy was read).
4. Whether Chrome's on-device site data setting has per-site exceptions for first-party data.
5. Whether top-level `navigator.credentials.get()` needs transient activation; spec sections §13, §14 and the RP ID text were not read.
6. How passkeys sync between Windows devices, and Firefox's status for immediate mediation.
7. Whether Cloudflare Access passkeys are available on the Free plan; whether instant authentication works with the one-time PIN method.
8. Whether Discord can be used as a Cloudflare Access IdP through generic OIDC.
9. Whether Access covers WebSockets or WebRTC signalling paths; whether Zero Trust sign-up requires a card.
10. Whether discord.com needs a web login session for `prompt=none`, how Discord behaves when none exists, the Discord refresh-token lifetime, and which OAuth scopes need approval.
11. Behavior of the bounce-tracking mitigations on a discord.com redirect in practice.
12. The IETF cookie draft (-22) expired on 4 June 2026 and no RFC number was found; a newer editor's copy was reported by a search snippet only and not read.

## 9. Sources read (all on 2026-11-15)

- IETF cookie draft: <https://datatracker.ietf.org/doc/draft-ietf-httpbis-rfc6265bis/>
- Chrome cookie cap: <https://developer.chrome.com/blog/cookie-max-age-expires>
- Firefox 142 notes: <https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/142>; Bugzilla 1973024 and 1974394
- MDN: Set-Cookie, Storage quotas and eviction criteria, `StorageManager.persist`, `CredentialsContainer.get`, Storage access policy, State partitioning, Redirect tracking protection, Bounce tracking mitigations
- Mozilla enterprise policies: <https://mozilla.github.io/policy-templates/>
- Google Chrome Help: <https://support.google.com/chrome/answer/14114868>
- W3C Web Authentication Level 3: <https://www.w3.org/TR/webauthn-3/>; WebAuthn immediate mediation explainer; Chrome conditional UI page and origin-trial post
- Microsoft Learn, passkeys in Windows: <https://learn.microsoft.com/en-us/windows/security/identity-protection/passkeys/>
- Cloudflare: plans page, account limits, seat management, session management, one-time PIN, identity providers, generic OIDC, Google, GitHub, passkeys, self-hosted public app, authorization cookie
- Discord: <https://docs.discord.com/developers/topics/oauth2>
