---
name: db-partial-index-hot-cold
description: Speed up "find the currently-active row" queries (open session, unlinked reading, pending job) on a table that accumulates unbounded history, without splitting into separate hot/cold tables. Use when a query like "WHERE card_id = ? AND closed_at IS NULL" will run millions of times against a table that never stops growing.
---

# Partial indexes for hot/cold data, instead of a second table

Real project: SmartCarParking's RFID check-in/out flow runs
`SELECT * FROM parking_sessions WHERE rfid_card = ? AND exit_time IS NULL ORDER BY
entry_time DESC LIMIT 1` on **every single RFID scan** — the hottest query in the
app — against a table that keeps every historical session forever.

## The instinct to avoid: physically splitting into two tables

"Active sessions" vs "session history" as separate tables *feels* like the right fix
(keep the hot table small), but it requires:
- An explicit move (DELETE + INSERT, in a transaction) at the exact moment a row
  transitions from active to closed — an extra write, an extra failure mode, and
  every future feature has to remember which table to query depending on state.
- Every read path that might care about "any session, active or not" (e.g. an
  overview/history page) now needs to query or UNION both tables.

## The actual fix: a partial index

```sql
CREATE INDEX ix_sessions_active_by_card
  ON parking_sessions (rfid_card, entry_time DESC)
  WHERE exit_time IS NULL;
```

A partial index (Postgres and SQLite both support `WHERE` on `CREATE INDEX`) only
**physically stores entries for rows matching the predicate**. The index's own size
stays proportional to "how many rows are currently active" (a few hundred parked
cars) regardless of how many million historical rows exist in the base table — same
practical benefit as a hot/cold table split, with zero schema migration, zero write-path
changes, and the base table remains the single source of truth for every other query.

Apply the same pattern anywhere the query shape is "give me the one row matching this
key that's still in flight" against an ever-growing table: unlinked plate reads
(`WHERE linked = false`), pending jobs, open tickets, unread notifications.

## Verify it actually gets picked, at realistic scale — not just that it exists

`CREATE INDEX IF NOT EXISTS` succeeding proves nothing about whether the query
planner will use it. On a near-empty table the planner will correctly prefer a
sequential scan (that's not a bug) — checking `EXPLAIN` at the *current* tiny table
size will show "Seq Scan" and can look like the index "didn't work" when actually it's
just not needed yet.

To verify meaningfully, bulk-insert synthetic historical rows at the scale you're
actually defending against (hundreds of thousands+), `ANALYZE`, then `EXPLAIN
ANALYZE` the real query:

```sql
INSERT INTO parking_sessions (plate, rfid_card, entry_time, exit_time, status)
SELECT 'PLATE'||g, 'CARD'||(g%5000), now() - (g||' seconds')::interval,
       CASE WHEN g % 500 = 0 THEN NULL ELSE now() - (g||' seconds')::interval + interval '30 minutes' END,
       CASE WHEN g % 500 = 0 THEN 'in' ELSE 'out' END
FROM generate_series(1, 300000) g;
ANALYZE parking_sessions;
EXPLAIN ANALYZE SELECT * FROM parking_sessions WHERE rfid_card='CARD0' AND exit_time IS NULL
  ORDER BY entry_time DESC LIMIT 1;
-- Index Scan using ix_sessions_active_by_card ... Execution Time: 0.05 ms
```

**Delete the synthetic rows immediately after** (`DELETE FROM parking_sessions WHERE
plate LIKE 'PLATE%'`) — don't leave load-test data sitting in what might be a shared
or production-adjacent database.

## Column order and direction matter for this pattern

Put the equality-filtered column first (`rfid_card`), then the `ORDER BY` column with
its actual sort direction (`entry_time DESC`) — this lets the same index serve both
the filter and the sort without a separate sort step, which is why the verified query
plan shows no `Sort` node above the index scan.

## When this ISN'T the right tool

- If "closed" rows need to be purged/archived for compliance or storage-cost reasons
  (not just query speed), you need actual partitioning or archival, not a partial
  index — a partial index doesn't shrink the base table.
- At truly enormous scale (tens of millions+ of historical rows across years), range
  partitioning by time becomes worth its complexity for the write-heavy history side
  — but don't reach for it prematurely; a partial index handles the "find the active
  one fast" problem completely on its own and partitioning solves a different problem
  (bulk archival/pruning), not this one.
