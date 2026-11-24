-- A tab sends on one media connection and receives on another (ADR 0005). Each tab has up
-- to two connections on record, one for each purpose; a share names the sending
-- connection it goes out on, and a watch the receiving connection it is pulled to.
--
-- The connections, shares and watches on record are dropped: they were made for one
-- connection a tab, and the instance restarts with this migration, so their tabs come back
-- as new tabs that make their connections again. Usage keeps what it holds, charged as
-- before, and from here on `usage_tab` holds each tab's receiving connection's totals.

DROP TABLE watch;
DROP TABLE share;
DROP TABLE media_connection;

-- A tab's connection for one purpose, made the first time it shares (`sending`) or
-- watches (`receiving`). `media_id` is the media server's identifier for it, null until
-- the media server has answered. A tab holds one `current` connection for each purpose.
-- A receiving connection being replaced (spec, Recovery) has a `replacement` while the
-- tab's watches are pulled onto it, and is `replaced` from then until its pulls are closed.
CREATE TABLE media_connection (
  id TEXT PRIMARY KEY,
  tab_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('sending', 'receiving')),
  role TEXT NOT NULL DEFAULT 'current' CHECK (role IN ('current', 'replacement', 'replaced')),
  device_id TEXT NOT NULL,
  room_address TEXT NOT NULL,
  media_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX media_connection_tab ON media_connection (tab_id);
CREATE UNIQUE INDEX media_connection_current ON media_connection (tab_id, purpose) WHERE role = 'current';

-- A share, sent from one tab's sending connection. Its tracks are named by the instance
-- and carried by the browser's transceivers, by mid. `live_at` is null until the media
-- server has registered the share: only then is it live. `qualities`, `max_bitrate` and
-- `ending_at` are as migrations 6 and 8 made them.
CREATE TABLE share (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  room_address TEXT NOT NULL,
  tab_id TEXT NOT NULL,
  connection_id TEXT NOT NULL REFERENCES media_connection (id),
  kind TEXT NOT NULL CHECK (kind IN ('screen', 'webcam')),
  video_track TEXT NOT NULL,
  video_mid TEXT NOT NULL,
  audio_track TEXT,
  audio_mid TEXT,
  created_at INTEGER NOT NULL,
  live_at INTEGER,
  qualities INTEGER NOT NULL DEFAULT 1 CHECK (qualities IN (1, 2)),
  max_bitrate INTEGER NOT NULL DEFAULT 1500000,
  ending_at INTEGER
);

CREATE INDEX share_room ON share (room_address);
CREATE INDEX share_member ON share (member_id, kind);
CREATE INDEX share_tab ON share (tab_id);
CREATE INDEX share_connection ON share (connection_id);

-- A watch, pulled to the receiving connection of the viewer's tab. It names the share
-- watched, and keeps its sharer and kind, so that a watch whose close failed still says
-- what it was after the share's own record is gone. A pulled track keeps the name of the
-- share's track; its mid is the media server's, so it is null until the pull returns.
-- `watching_at` is null until then too: only then is the share on the viewer's stage. A
-- watch pulled again onto a replacement connection takes the old one's `watching_at` as
-- the replacement is done. `quality` and `left_at` are as migrations 6 and 8 made them.
CREATE TABLE watch (
  id TEXT PRIMARY KEY,
  tab_id TEXT NOT NULL,
  connection_id TEXT NOT NULL REFERENCES media_connection (id),
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
  watching_at INTEGER,
  quality TEXT NOT NULL DEFAULT 'auto' CHECK (quality IN ('auto', '1080p', '720p')),
  left_at INTEGER
);

CREATE INDEX watch_tab ON watch (tab_id);
CREATE INDEX watch_connection ON watch (connection_id);
CREATE INDEX watch_share ON watch (share_id);
