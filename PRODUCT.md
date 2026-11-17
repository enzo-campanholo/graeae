# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A group of friends, usually 4 and sometimes 6, who spend their evenings together in a Discord voice channel. They are on Windows desktops in current Chrome-family browsers. Some open graeae on a second monitor beside a game they are playing, to show each other their games and their faces while they talk. Many open it on their main monitor to watch together, as a watch party, with the stage as the thing they are looking at.

One of them is the **owner**: they deployed the instance, pay for it if anything is ever paid, and now and then do the admin: inviting people, granting rooms, removing someone, watching the usage meter. The owner is also an ordinary member the rest of the time.

## Product Purpose

graeae lets the group share screens and webcams with each other while Discord keeps the voice and the text. It exists because Discord's own sharing does not give them smooth 1080p at 60 fps, several screens live at once, or the freedom to watch one friend's screen beside another's webcam.

Success is: open the address, and within a few clicks and 15 seconds be watching or sharing, with no login screen ever. It keeps working on nights the owner is not there, and it never produces a surprise bill.

## Positioning

A private instance per friend group, deployed by one of them to their own Cloudflare account on the free plan and given away as 0BSD code. There is no service to sign up to and no account: each browser is remembered as a device from a single-use invite. Several shares can be live at once, and each viewer picks what to watch.

## Operating Context

- Discord runs alongside, carrying voice and text. graeae never touches a microphone.
- A room is a standing place, always open. People drop in during an evening, start and stop shares, and leave the tab open for hours.
- The usual scenes: someone in a game asks the others to watch; a watch party on the main monitor; a quick look at a friend's webcam.
- Owner admin happens rarely and at a calm moment, on the owner page.

## Capabilities and Constraints

- Pages: a room (a bar of people on the left and a stage filling the rest), the list of rooms, the "You" page, the one-button invite page, the owner page (People, Invites, Rooms, Usage) and one "nothing here" page for every refused address.
- Desktop only. No phone layout is designed.
- Supported platform is Windows 11 in current stable Chrome or Helium. Firefox, macOS and Linux are Limited. Everything else is best effort and is never mentioned in the app.
- A gap is shown only when it matters and only to the member affected. No banners on arrival.
- Terms follow `GLOSSARY.md` exactly: instance, owner, member, device, invite, room, access, present, share, live, watch, stage, usage, usage budget. The app never says user, account, stream, channel or session.
- The design is governed by the spec at `.scratch/v1-build/spec.md`.

## Brand Commitments

- The name is **graeae**, written in lower case. It may change one day, but it holds for now.
- The theme is the Graeae myth: three sisters who share one eye between them. The design may use it, and the owner has an idea for a loading animation built on it.
- The current icon (a pink rounded square with a "G") is a placeholder and may be replaced.
- Dark mode first; a light mode is offered too.
- Craft references named by the owner: Linear and Vercel set the bar for precision. Bold expression is welcome when it does not break familiar UI conventions.
- The loading animation (a left hand passes an eye to a right hand, which moves to the left, and the loop repeats) is made by a friend of the owner in Blender or After Effects. The app leaves a slot for it and does not draw its own version.
- Voice: plain with some warmth. Labels are short and literal ("Forget", "Let back in", "Nothing here"). An empty state or notice can have a friendly or wry line. No marketing tone and no exclamation marks.

## Evidence on Hand

- The spec and decisions: `.scratch/v1-build/spec.md`, `.scratch/v1/map.md`.
- Throwaway prototypes of the layout: branches `prototype/room-experience` (variant D) and `prototype/owners-admin-surface` (variant B).
- No real screenshots, users, testimonials or metrics exist. Do not invent them.

## Product Principles

1. **The shares are the point.** The stage belongs to what people are showing each other; the interface around it stays out of the way.
2. **A few clicks to the picture.** One click to watch a member or share a webcam; three to share a screen.
3. **Among friends, not a service.** No sign-in, no account language, no onboarding tours. It should feel like something one of them set up.
4. **Say only what matters, to whom it matters.** Notes and gaps go to the one member affected, at the moment they matter.
5. **Owner chores stay out of the room.** Nothing owner-only sits in the room beyond the gear.
