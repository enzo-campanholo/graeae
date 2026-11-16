# People and rooms

Type: grilling
Status: resolved
Map: ../map.md

## Question

Who exists in a graeae instance and where do they share?

Decide:

- The roles. The owner deploys and administers the instance; members are let in by the owner. Whether there is anything between or beyond those two.
- Whether v1 has one room or several. The user would like a room per friend group if it is not expensive. One room means the URL is the room and nobody picks anything; several rooms need membership per room and a way to land in the right one without adding clicks.
- What a member with access to one room sees on opening the URL, and what a member with several sees.
- What the app does when the owner is absent, which must be "everything a member needs".
- The vocabulary: owner or admin, member, room, share, and whether "instance" is a term. Write the settled terms to `GLOSSARY.md`.

Unblocks [Getting in](10-getting-in.md) and [Room experience](12-room-experience.md).

## Answer

Settled by grilling on 2026-11-15 and 2026-11-16. The terms are in [GLOSSARY.md](../../../GLOSSARY.md).

**People**

- An instance has exactly one owner, set at deploy time and not transferable inside the app. The owner is also a member. A second administrator means sharing the owner's access, not a second owner record.
- Everyone else is a member, and all members are equal. There are no guests, moderators or co-admins. A one-night visitor is a member who is removed afterwards.
- A member is a person with one display name and one or more remembered devices. The owner sets the display name when inviting and the member can change it. There is no avatar or profile.
- Only the owner lets people in and removes them. Removal, from one room or from the instance, takes effect at once and ends the member's presence and any shares they are sending or watching.
- A member can get a new device remembered by themselves, starting from a device already remembered. The owner is needed only when every device is lost.

**Rooms**

- An instance has several rooms. Each has a name the owner can change and an address fixed at creation. Setup creates the first room, and new members get access to it unless the owner says otherwise.
- A member belongs to the instance once and holds access per room. Removing a member from the instance ends all their access and devices.
- The owner has access to every room and is never hidden: they are present like anyone else.
- A room is permanent and always open, with no start or end of a call.
- A member is present once in a room however many devices they have it open on, and every such device can share and watch. Being present in two rooms at once is allowed.
- The design ceiling of 8 is members present in one room at once. Access lists and the number of rooms are uncapped in v1.
- Inside a room, a member sees every member with access to it, not only those present.

**Arriving**

- At the instance's root address, a member with access to one room is taken straight into it. A member with several sees a list of their rooms showing who is present in each.
- A room address the visitor has no access to gives the same "nothing here" page as a room that does not exist, whether the visitor is a stranger or a member without access to that room.

**Shares**

- A share is one thing a member sends into a room, and viewers opt in per share. A screen share is video together with its audio when there is any, as one unit. A webcam share is video only.
- How many shares one member may send at once is left to [Room experience](12-room-experience.md).

**When the owner is absent**

- Existing members can open their rooms, watch, share and add their own devices.
- Admitting new members, removing members and creating or renaming rooms wait for the owner.

No ADR was written: none of these decisions is both hard to reverse and surprising.
