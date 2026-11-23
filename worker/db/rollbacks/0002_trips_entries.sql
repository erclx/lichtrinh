-- Reverses migrations/0002_trips_entries.sql. Run by hand with
-- `bunx wrangler d1 execute DB --local --file worker/db/rollbacks/0002_trips_entries.sql`.
-- Children drop before trips, which both of them reference.
DROP INDEX IF EXISTS `changes_trip_id_seq_idx`;
DROP INDEX IF EXISTS `changes_undoes_idx`;
DROP INDEX IF EXISTS `changes_seq_idx`;
DROP TABLE IF EXISTS `changes`;
DROP INDEX IF EXISTS `entries_trip_id_starts_on_idx`;
DROP TABLE IF EXISTS `entries`;
DROP TABLE IF EXISTS `trips`;
DELETE FROM `d1_migrations` WHERE `name` = '0002_trips_entries.sql';
