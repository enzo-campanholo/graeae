# graeae

A private web app where a small friend group shares screens and webcams with each other alongside their Discord voice channel.

## Language

**Instance**:
One deployed copy of graeae: one owner, one address, and the rooms and members that belong to it.
_Avoid_: Server, deployment, site

**Owner**:
The one person who deploys an instance, administers it and answers for its cost. The owner is also a member, with access to every room.
_Avoid_: Admin, host, moderator

**Member**:
A person the owner has let into an instance. All members are equal; there is no guest and no role between member and owner.
_Avoid_: User, guest, participant, account

**Device**:
One browser that an instance remembers as belonging to a member. A member has one or more. A device is forgotten when it goes unused too long, when the member or the owner forgets it, or when the member is removed.
_Avoid_: Session, client, login

**Invite**:
A single-use link that gets one browser remembered as a device of one named person. The owner sends one to let a person in or back in; a member makes one to add a device of their own.
_Avoid_: Token, magic link, join code

**Setup secret**:
A value the owner sets when deploying an instance, which makes a browser the owner's device. It is the owner's way in on a fresh instance and the way back in after losing every device.
_Avoid_: Admin password, master key

**Display name**:
The single name a member is shown by, first set by the owner and changeable by the member.
_Avoid_: Username, nickname, handle

**Room**:
A standing place inside an instance where a group shares, always open and with no start or end. It has a name the owner can change and an address that never changes.
_Avoid_: Channel, call, lobby, space, session

**Access**:
The owner's grant that lets a member into one room. A member belongs to the instance once and holds access to each of their rooms separately.
_Avoid_: Membership, permission, role

**Present**:
A member is present in a room while they have it open on at least one device. A member is present once, however many devices they have it open on. A member whose connection is lost stays present for a short grace period.
_Avoid_: Online, joined, connected, in the call

**Share**:
One thing a member is sending into a room, which other present members choose individually to watch. It is either a screen share or a webcam share.
_Avoid_: Stream, broadcast, feed

**Live**:
A share is live from the moment other present members can watch it until it ends. A share nobody watches is still live.
_Avoid_: Active, on air, streaming

**Screen share**:
A share of a screen, window or tab, together with its screen audio when there is any.
_Avoid_: Screencast, stream

**Screen audio**:
The sound of the tab or application being shared, sent as part of a screen share. It is never a microphone and never the whole system's sound.
_Avoid_: System audio, desktop audio, sound share

**Webcam share**:
A share of a member's camera, video only.
_Avoid_: Camera, video, cam

**Watch**:
A present member watches a share when they have chosen to receive it. Watching is chosen per share, and a share nobody watches is still live.
_Avoid_: View, subscribe, tune in

**Stage**:
The part of a room's screen that shows the shares a member is watching. It is empty until the member watches something.
_Avoid_: Grid, canvas, player

**Usage**:
The media members have watched in the current month, counted in GB. Only watching adds to it; a share nobody watches adds nothing.
_Avoid_: Bandwidth, traffic, data

**Usage budget**:
The monthly limit on usage that the owner sets for an instance. When usage reaches it, watching stops until the owner raises it or the month resets.
_Avoid_: Quota, cap, data limit, spending limit
