-- The people and rooms an instance starts with: its members (the owner among them), the
-- browsers remembered as their devices, and its rooms.

CREATE TABLE member (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  is_owner INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- An instance has exactly one owner.
CREATE UNIQUE INDEX member_one_owner ON member (is_owner) WHERE is_owner = 1;

-- A device is known by a hash of its cookie's value; the value itself is never stored.
CREATE TABLE device (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES member (id),
  token_hash TEXT NOT NULL UNIQUE,
  browser TEXT NOT NULL,
  os TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
);

CREATE INDEX device_member ON device (member_id);

-- A room's address is fixed when it is created.
CREATE TABLE room (
  address TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
