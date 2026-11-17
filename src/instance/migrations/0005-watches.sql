-- Each act of watching (ADR 0003): a share pulled to a viewer's media connection. Like
-- the shares, a watch is written before the media server is called and dropped only once
-- the forced close of its pulled tracks has returned.

-- A watch, pulled to the media connection of the viewer's tab. It names the share
-- watched, and keeps its sharer and kind, so that a watch whose close failed still says
-- what it was after the share's own record is gone. A pulled track keeps the name of the
-- share's track; its mid is the media server's, so it is null until the pull returns.
-- `watching_at` is null until then too: only then is the share on the viewer's stage.
CREATE TABLE watch (
  id TEXT PRIMARY KEY,
  tab_id TEXT NOT NULL REFERENCES media_connection (tab_id),
  member_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  room_address TEXT NOT NULL,
  share_id TEXT NOT NULL,
  sharer_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('screen', 'webcam')),
  video_track TEXT NOT NULL,
  video_mid TEXT,
  audio_track TEXT,
  audio_mid TEXT,
  created_at INTEGER NOT NULL,
  watching_at INTEGER
);

CREATE INDEX watch_tab ON watch (tab_id);
CREATE INDEX watch_share ON watch (share_id);
