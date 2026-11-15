-- Banco EXCLUSIVO do ClassDamas em Cloudflare D1.
-- Não executar este arquivo no banco do Torneio das Três Casas.
CREATE TABLE IF NOT EXISTS seasons (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  started_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0,1))
);
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_season ON seasons(active) WHERE active=1;
CREATE TABLE IF NOT EXISTS sessions (
  hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS presence (
  session_hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  seen_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_presence_seen ON presence(seen_at);
CREATE INDEX IF NOT EXISTS idx_presence_player_seen ON presence(player_id,seen_at);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id),
  creator_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  white_hero INTEGER NOT NULL,
  black_hero INTEGER NOT NULL,
  status TEXT NOT NULL,
  board_json TEXT NOT NULL,
  turn TEXT NOT NULL,
  ply INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 0,
  repetitions_json TEXT NOT NULL,
  no_capture INTEGER NOT NULL DEFAULT 0,
  result TEXT,
  reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_matches_creator ON matches(creator_id,created_at);
CREATE INDEX IF NOT EXISTS idx_matches_recipient ON matches(recipient_id,created_at);
CREATE INDEX IF NOT EXISTS idx_matches_rank ON matches(season_id,status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_open_pair
 ON matches(season_id,creator_id,recipient_id)
 WHERE status IN ('PENDENTE','EM_ANDAMENTO');
CREATE TABLE IF NOT EXISTS moves (
  match_id TEXT NOT NULL REFERENCES matches(id),
  ply INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  path_json TEXT NOT NULL,
  captures_json TEXT NOT NULL,
  crowned INTEGER NOT NULL,
  played_at TEXT NOT NULL,
  PRIMARY KEY(match_id,ply)
);
CREATE TABLE IF NOT EXISTS operations (
  player_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  response_json TEXT NOT NULL,
  PRIMARY KEY(player_id,request_id)
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS teacher_attempts (
  ip_hash TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS admin_audit (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  detail TEXT NOT NULL,
  at TEXT NOT NULL
);
