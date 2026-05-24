-- Initial transcriber schema: jobs and their per-chunk progress.
-- IDs are generated in Node (crypto.randomUUID) so no pgcrypto dependency.

CREATE TABLE IF NOT EXISTS transcribe_jobs (
  id               uuid PRIMARY KEY,
  filename         text NOT NULL,
  content_type     text,
  file_size        bigint,
  chunk_unit       text NOT NULL,
  chunk_size       numeric NOT NULL,
  model            text NOT NULL,
  status           text NOT NULL DEFAULT 'pending',
  total_chunks     int  NOT NULL DEFAULT 0,
  completed_chunks int  NOT NULL DEFAULT 0,
  source_key       text,
  result_key       text,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transcribe_chunks (
  id         uuid PRIMARY KEY,
  job_id     uuid NOT NULL REFERENCES transcribe_jobs(id) ON DELETE CASCADE,
  idx        int  NOT NULL,
  object_key text NOT NULL,
  start_sec  numeric,
  dur_sec    numeric,
  status     text NOT NULL DEFAULT 'pending',
  transcript text,
  error      text,
  UNIQUE (job_id, idx)
);

CREATE INDEX IF NOT EXISTS idx_chunks_job ON transcribe_chunks(job_id);
