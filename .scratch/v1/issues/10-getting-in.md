# Getting in

Type: grilling
Status: resolved
Blocked by: 05, 06
Map: ../map.md

## Question

How does a person become a member, and how does their browser stay recognised afterwards?

The target is that after one-time setup a member opens the URL, sees no login screen, and is watching or sharing in a few clicks and under 15 seconds. Only the owner adds people, and can remove them.

Decide, using [Remembered-device access](05-remembered-device-access.md) and [People and rooms](06-people-and-rooms.md):

- The mechanism: invite link with a remembered credential, passkey, Cloudflare Access, Discord sign-in, or a combination.
- What the owner does to add a member, and what the new member does on their first device.
- How a member gets a second device remembered by themselves from one already remembered, what happens after a browser is cleared, and when the remembered credential expires.
- How a member who has lost every device gets back in through the owner.
- How removal reaches a member who is present, given that it must take effect at once.
- How the first owner device is recognised on a fresh instance.

Already settled in [People and rooms](06-people-and-rooms.md), not to be reopened: only the owner admits and removes members; the owner sets the display name at invite time; a member is a person with one or more devices; access is per room; an address the visitor has no access to gives the same "nothing here" page as one that does not exist.

## Answer

Settled by grilling on 2026-11-16. The new terms, invite and setup secret, are in [GLOSSARY.md](../../../GLOSSARY.md).

**Mechanism**

- A device is remembered by an invite that sets a long-lived cookie, and by nothing else. v1 has no passkeys, no Discord sign-in and no Cloudflare Access.
- A device stays remembered for 400 days from its last visit, renewed on every visit, with no fixed end date. It is forgotten by disuse, by the member or the owner forgetting it, or by removal of the member.
- A cleared browser is a new, unremembered browser. The member adds it again from another of their devices, or asks the owner if they have none.

**Invites**

- An invite is a single-use link for one named person. A used, expired or cancelled invite gives the "nothing here" page.
- The owner's invite carries the display name and the rooms to grant, is valid for 7 days, and can be cancelled before use. The owner sends it however they like.
- Opening an invite shows a page with one button, "Join as <display name>". Only the button press uses up the invite and remembers the device, so a chat app's link preview cannot burn it. The person then lands straight in their room.
- A person becomes a member at the button press. Until then there is only a pending invite, visible to the owner alone, and the name does not appear in any room.

**More devices**

- A member adds a device by pressing "Add a device" on a remembered one, which shows a single-use invite valid for 10 minutes to open on the new device. The new device gets the same one-button page. There is no approval step on the old device, no cap on devices, and no QR code.
- A member sees a list of their devices (browser, operating system, last used) and can forget any of them without the owner. The owner can see and forget any member's devices.

**Losing every device**

- The owner sends the member a fresh 7-day invite. Using it forgets all of the member's previous devices. The member keeps their display name and room access.

**Removal**

- Removal reaches a present member within about 2 seconds on every device they have open. Their shares stop for everyone, what they are watching stops, and the page becomes the plain "nothing here" page with no message.
- Removal from one room does this for that room only. Removal from the instance does it everywhere and forgets all the member's devices.

**The owner**

- The deployer sets a setup secret when deploying. On a fresh instance the owner opens a setup address carrying it; that browser becomes the owner's first device and the first room is created. Without the secret the setup address gives the "nothing here" page.
- The owner adds further devices the same way members do. Every owner device carries full owner powers with no extra confirmation.
- The setup secret is also the owner's way back in after losing every device, and using it again forgets all the owner's other devices. That is the remedy for a stolen owner device.

**Left to other tickets**

- How the 2-second cut-off is enforced on the media server: [Media server access control](16-media-server-access-control.md), then the map's Securing the media layer.
- Where the owner's invite, member and device screens live: [Owner's admin surface](17-owners-admin-surface.md).

No ADR was written: cookie-only is easy to extend later with another sign-in method.
