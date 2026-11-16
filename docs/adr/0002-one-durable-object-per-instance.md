# One Durable Object per instance holds all state

All of an instance's state lives in a single Durable Object: members, devices, rooms, access and invites in its built-in SQLite, and who is present in its hibernating WebSocket connections. Which shares are live and who watches them are also written to its storage, so they survive a restart of the object. There is no D1 and no KV. The usual pattern of one object per room with a shared database was rejected for two reasons: two objects awake all day exceed the free plan's Durable Object duration quota, while one stays under 42% during sessions; and removing a member must cut them off within about 2 seconds, which is simple when membership and the open connections sit in the same object and a fan-out when they do not.

## Consequences

- An instance is sized for a friend group, with a design ceiling of 8 people. Growing far past that means splitting the object and migrating its stored state.
- The 42% figure rests on assumed message rates and should be measured once something is built.
