-- A share whose end has begun (spec, Cut-off). The room hears it ended as its close
-- begins, and from then on it no longer counts: it is not listed, watched or in the way
-- of a new share of its kind. Its record stays until its close returns, which may take
-- tries, and a restart, so the mark is kept here and goes with the record.
ALTER TABLE share ADD COLUMN ending_at INTEGER;

-- A pull of such a share has left its watcher's stage, and the watcher was told so; the
-- pull's record stays until its own close returns, which tells nobody again.
ALTER TABLE watch ADD COLUMN left_at INTEGER;
