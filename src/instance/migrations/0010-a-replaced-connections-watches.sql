-- Usage (spec, Usage and the usage budget): a watch on a receiving connection the tab has
-- left behind, by a replacement or a new connection, is `old_connection` from then on. The
-- tab's total counts from zero on the new connection, so no report covers what the old one
-- receives: the watch is charged at its share's maximum bitrate from `since` (the old
-- connection's last report, or the watch's start if later) until it ends, as relayed when
-- that report was, whatever the tab reports after.
ALTER TABLE usage_watch ADD COLUMN old_connection INTEGER NOT NULL DEFAULT 0;
