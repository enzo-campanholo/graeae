# Cloudflare account check

Type: task
Status: resolved
Map: ../map.md

## Question

Can Cloudflare's media server be switched on in the owner's account with no payment method, and what does the account say about passing the free allowance?

This is manual work in the owner's Cloudflare dashboard, needed because the docs do not say. [Media transport choice](08-media-transport-choice.md) chose Cloudflare Realtime SFU.

Checklist for the owner:

- [x] Note whether the account has a payment method on file today.
- [x] In the dashboard, open Realtime and create an SFU application. Record whether it asks for a payment method or a paid plan first.
- [x] Record what the page or any prompt says about usage past 1,000 GB: billed, blocked, or nothing.
- [x] Check whether the dashboard shows the application's usage (egress in GB) and over what period.
- [x] Check whether a budget alert can be created on this account, and whether it lists Realtime.
- [x] Store the application's ID and secret somewhere safe outside the repo, and record where.

The answer records each result. It feeds [Usage budget](14-usage-budget.md) and [Quality proof](13-quality-proof.md), which needs the application to exist.

## Comments

**2026-11-16, partial results from the owner (application not created yet).**

- The account already has a card on file, from registering the domain.
- Realtime has to be activated once on a "Secure billing" page. It requires a payment method but no paid plan.
- That page states the terms: "Realtime data transferred: 1,000 GB included per month for MoQ Relay, TURN Server, and Realtime SFU, then $0.05 per additional GB", and the owner must tick "I authorize Cloudflare to charge this card for usage that exceeds free limits each month until cancellation." So usage past the allowance is billed automatically, not blocked, and the 1,000 GB is one pool shared by the media server and the relay.
- The Serverless SFU page has an Analytics tab. What it shows and over what period is not yet checked.
- Notifications lists an enabled "Default budget alert (auto-created)", product Billing, sent by email. Its threshold, and whether it covers Realtime usage, are not yet checked.

## Answer

Done by the owner in the Cloudflare dashboard on 2026-11-16. Realtime is activated and an SFU application named `graeae` exists.

- **Payment method.** Activating Realtime requires a card on file but no paid plan. The owner's account already had one from registering the domain. A deployer with no card cannot use the media server.
- **Past the allowance.** Billed automatically, never blocked. The activation page reads "1,000 GB included per month for MoQ Relay, TURN Server, and Realtime SFU, then $0.05 per additional GB", and the owner authorises Cloudflare "to charge this card for usage that exceeds free limits each month until cancellation".
- **One shared pool.** The 1,000 GB covers the media server and the relay together, not 1,000 GB each.
- **Usage display.** The Serverless SFU page has an Analytics tab with one chart, "Serverless SFU App Egress & Ingress", defaulting to the last 24 hours with a selectable range and filters. It showed "No data" for the new application, so its units and whether it gives a month-to-date total are unconfirmed.
- **Budget alert.** Notifications holds an enabled "Default budget alert (auto-created)", product Billing, sent by email, at a $10 threshold the owner can change. $10 is 200 GB past the allowance. It is an account-wide billing alert; whether Realtime charges count toward it before the invoice is unconfirmed.
- **Credentials.** The application's ID and secret are stored in the owner's Proton Pass, outside the repo.
