-- Reverses migrations/0005_notices.sql. Run by hand with
-- `bunx wrangler d1 execute DB --local --file worker/db/rollbacks/0005_notices.sql`.
DROP TABLE IF EXISTS `outage_notices`;
DROP TABLE IF EXISTS `push_devices`;
DROP TABLE IF EXISTS `notify_emails`;
DELETE FROM `d1_migrations` WHERE `name` = '0005_notices.sql';
