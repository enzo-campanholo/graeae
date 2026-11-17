-- Access to rooms for members other than the owner, who has every room by rule, and the
-- owner's invites that let a named person in.

CREATE TABLE access (
  member_id TEXT NOT NULL REFERENCES member (id),
  room_address TEXT NOT NULL REFERENCES room (address),
  PRIMARY KEY (member_id, room_address)
);

-- An invite is pending until it is used or cancelled, when its rows are deleted, or until
-- it expires. Its code is kept as it is, so the owner can copy the link again.
CREATE TABLE invite (
  code TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- The rooms a member made by the invite gets access to.
CREATE TABLE invite_room (
  invite_code TEXT NOT NULL REFERENCES invite (code),
  room_address TEXT NOT NULL REFERENCES room (address),
  PRIMARY KEY (invite_code, room_address)
);
