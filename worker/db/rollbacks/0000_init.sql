-- Reverses migrations/0000_init.sql. Run by hand with
-- `bunx wrangler d1 execute DB --local --file worker/db/rollbacks/0000_init.sql`.
DROP INDEX IF EXISTS `users_username_unique`;
DROP TABLE IF EXISTS `users`;
DELETE FROM `d1_migrations` WHERE `name` = '0000_init.sql';
