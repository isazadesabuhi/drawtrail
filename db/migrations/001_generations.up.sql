CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS generations (
  id uuid PRIMARY KEY,
  idempotency_key char(64) UNIQUE,
  request_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  progress_json jsonb,
  result_json jsonb,
  error_json jsonb,
  provenance_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  queue_enqueued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS generation_candidates (
  generation_id uuid NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  target_geometry geometry(LineString, 4326) NOT NULL,
  route_geometry geometry(LineString, 4326) NOT NULL,
  route_json jsonb NOT NULL,
  metrics_json jsonb NOT NULL,
  provenance_json jsonb NOT NULL,
  PRIMARY KEY (generation_id, ordinal)
);

CREATE INDEX IF NOT EXISTS generations_status_created_idx
  ON generations(status, created_at);
CREATE INDEX IF NOT EXISTS generation_candidates_route_gix
  ON generation_candidates USING GIST(route_geometry);
