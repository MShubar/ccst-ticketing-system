CREATE TABLE IF NOT EXISTS documents (
  doc_key TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS documents_updated_at_idx ON documents (updated_at);
