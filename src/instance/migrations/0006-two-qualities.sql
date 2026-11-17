-- Two qualities (spec, Encoding and quality). A Chromium screen share goes out at 1080p
-- and 720p, and each viewer chooses the quality they watch it at.

-- Each share: how many qualities it goes out at, 2 for a viewer to choose between or 1,
-- and its maximum bitrate in bits per second, the usage count's figure for a gap (12 Mbps
-- for a Chromium screen share, 6 for a Firefox one, 1.5 for a webcam). A share recorded
-- before this went out at one quality: a screen share at 12 Mbps, a webcam at 1.5.
ALTER TABLE share ADD COLUMN qualities INTEGER NOT NULL DEFAULT 1 CHECK (qualities IN (1, 2));
ALTER TABLE share ADD COLUMN max_bitrate INTEGER NOT NULL DEFAULT 1500000;
UPDATE share SET max_bitrate = 12000000 WHERE kind = 'screen';

-- Each watch: the quality its viewer chose, "auto" until they choose. Only a share with
-- two qualities is ever watched at anything else.
ALTER TABLE watch ADD COLUMN quality TEXT NOT NULL DEFAULT 'auto' CHECK (quality IN ('auto', '1080p', '720p'));
