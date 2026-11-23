-- Reverses migrations/0004_transcriptions.sql. Run by hand with
-- `bunx wrangler d1 execute DB --local --file worker/db/rollbacks/0004_transcriptions.sql`.
DROP INDEX IF EXISTS `transcriptions_model_idx`;
DROP TABLE IF EXISTS `transcriptions`;
DELETE FROM `d1_migrations` WHERE `name` = '0004_transcriptions.sql';
