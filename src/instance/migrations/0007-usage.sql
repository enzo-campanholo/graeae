-- Usage (spec, Usage and the usage budget): what members' tabs receive over their media
-- connections, as each tab reports it, and the owner's settings for the month.

-- What was charged on each UTC day, in bytes, the instance's own rules already applied.
-- `day` is that day's midnight in milliseconds since the epoch. The month is summed from
-- these, so changing the day it resets on needs nothing recounted.
CREATE TABLE usage_day (
  day INTEGER PRIMARY KEY,
  bytes REAL NOT NULL
);

-- Each tab's last report: the running total its media connection's transport had
-- received, when, and whether it was on the relay. After a final total, sent before a
-- connection restart, `restarted` is 1 and the next total counts from zero.
CREATE TABLE usage_tab (
  tab_id TEXT PRIMARY KEY,
  total INTEGER NOT NULL,
  reported_at INTEGER NOT NULL,
  relayed INTEGER NOT NULL,
  restarted INTEGER NOT NULL DEFAULT 0
);

-- Each share on a viewer's stage, for the charge where no later total arrives: the
-- share's maximum bitrate in bits per second, from `since` (the watch starting, or the
-- viewer's tab's latest report since) until `ended_at`, when the instance recorded the
-- watch as ended. A watch that ended stays until its tab's next report covers it, or is
-- charged once its tab can report no more.
CREATE TABLE usage_watch (
  watch_id TEXT PRIMARY KEY,
  tab_id TEXT NOT NULL,
  max_bitrate INTEGER NOT NULL,
  since INTEGER NOT NULL,
  relayed INTEGER NOT NULL DEFAULT 0,
  ended_at INTEGER
);

CREATE INDEX usage_watch_tab ON usage_watch (tab_id);

-- The owner's settings for the instance, one row each.
CREATE TABLE setting (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
