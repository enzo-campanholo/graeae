-- Invites for a member who already exists: "Add a device", which a member makes for
-- themselves. An invite with no member makes a new one, as the owner's invites do.

ALTER TABLE invite ADD COLUMN member_id TEXT REFERENCES member (id);

-- Who made the invite for whom: 'owner' for the owner's invites, which only the owner
-- sees as pending, and 'device' for a member's own "Add a device".
ALTER TABLE invite ADD COLUMN kind TEXT NOT NULL DEFAULT 'owner';
