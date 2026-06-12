# Deferred Hardening

Items surfaced during the Tasks 1–10 backend review (2026-06-12) that we
consciously chose **not** to fix at that point, with where they should land.

## To handle during their natural task

### Upload duration enforcement
`config.max_duration_s` (15 min) is defined but not enforced anywhere. A long
file passes size checks and goes straight into `decode_to_48k`, which loads the
entire signal into RAM as float32 (~345 MB for 15 min stereo at 48 kHz, and
ffmpeg holds another copy in its stdout buffer; with 2 job workers that's ~1.4 GB
peak).

**Plan:** enforce in the API preprocess/validation step (Task 11 upload route),
rejecting over-long files before they reach the pipeline. The client-side probe
in the upload modal (Task 19) gives the early UX beat; the API is the
authoritative gate.

## P1 hardening (no natural P0 home)

### SQLite concurrent-writer locking
The request thread and the background `InProcessJobRunner` thread write the same
rows through separate sessions. SQLite serialises writes with a file lock and can
raise `database is locked` under contention. Not observed yet (writes are short
and the job is the only sustained writer), but the standard mitigation is to
enable WAL mode and a busy timeout on the engine:

```python
# app/db/base.py — connect_args / PRAGMA on connect
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
```

Revisit if/when re-analysis or multi-comparison concurrency lands.

## Minor / noted, low priority

- **`get_settings()` creates directories as an import-time side effect** (via
  `db/base.py` importing config at module load). Harmless, slightly surprising;
  leave as-is unless it causes test-isolation issues.
- **Session cookie has no `secure=True`** — correct for localhost dev. Add it
  (conditionally, behind a setting) if the app is ever served over HTTPS.

## Fixed in the review (for the record)

- **`created_at` timezone loss** — added `UtcDateTime` TypeDecorator
  (`app/db/types.py`); all `created_at` columns now store naive-UTC and return
  tz-aware UTC, so `.isoformat()` carries `+00:00` and the TTL sweeper compares
  aware-vs-aware.
- **`Job` had no timestamp** — added `Job.created_at` + `order_by="Job.created_at"`
  on the `Comparison.jobs` relationship, so `comp.jobs[-1]` is reliably the
  latest job once re-analysis exists.
- **Hardcoded `TARGET_SR` in `decode.py`** — now sources `analysis_sample_rate`
  from config (overridable via the `target_sr` arg).
