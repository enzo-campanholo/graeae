-- The instance's records of what it has asked of the media server (ADR 0003): each tab's
-- media connection, and each share sent over one. A record is written before the media
-- server is called and dropped only once the forced close for it has returned, so the
-- media server never holds a track these do not account for.

-- A tab's one media connection, made the first time it shares or watches. `media_id` is
-- the media server's identifier for it, null until the media server has answered.
CREATE TABLE media_connection (
  tab_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  room_address TEXT NOT NULL,
  media_id TEXT,
  created_at INTEGER NOT NULL
);

-- A share, sent from one tab's media connection. Its tracks are named by the instance
-- and carried by the browser's transceivers, by mid. `live_at` is null until the media
-- server has registered the share: only then is it live.
CREATE TABLE share (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  room_address TEXT NOT NULL,
  tab_id TEXT NOT NULL REFERENCES media_connection (tab_id),
  kind TEXT NOT NULL CHECK (kind IN ('screen', 'webcam')),
  video_track TEXT NOT NULL,
  video_mid TEXT NOT NULL,
  audio_track TEXT,
  audio_mid TEXT,
  created_at INTEGER NOT NULL,
  live_at INTEGER
);

CREATE INDEX share_room ON share (room_address);
CREATE INDEX share_member ON share (member_id, kind);
CREATE INDEX share_tab ON share (tab_id);
