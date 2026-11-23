-- Reverses migrations/0003_chats.sql. Run by hand with
-- `bunx wrangler d1 execute DB --local --file worker/db/rollbacks/0003_chats.sql`.
-- Messages drop before chats, which they reference.
DROP INDEX IF EXISTS `chat_messages_reply_to_idx`;
DROP INDEX IF EXISTS `chat_messages_chat_id_created_at_idx`;
DROP TABLE IF EXISTS `chat_messages`;
DROP INDEX IF EXISTS `chats_owner_id_updated_at_idx`;
DROP TABLE IF EXISTS `chats`;
DELETE FROM `d1_migrations` WHERE `name` = '0003_chats.sql';
