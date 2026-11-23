-- Reverses migrations/0001_accounts.sql. Run by hand with
-- `bunx wrangler d1 execute DB --local --file worker/db/rollbacks/0001_accounts.sql`.
DROP TABLE IF EXISTS `sign_in_attempts`;
DROP TABLE IF EXISTS `settings`;
DROP INDEX IF EXISTS `auth_sessions_user_id_idx`;
DROP TABLE IF EXISTS `auth_sessions`;
ALTER TABLE `users` DROP COLUMN `language`;
ALTER TABLE `users` DROP COLUMN `can_chat`;
ALTER TABLE `users` DROP COLUMN `password_hash`;
DELETE FROM `d1_migrations` WHERE `name` = '0001_accounts.sql';
