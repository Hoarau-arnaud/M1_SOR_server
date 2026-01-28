PRAGMA foreign_keys = ON;

-- -----------------------
-- Users
-- -----------------------
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('USER', 'ADMIN')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -----------------------
-- Polls
-- -----------------------
CREATE TABLE IF NOT EXISTS polls (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL,
  title          TEXT NOT NULL,
  description    TEXT,
  status         TEXT NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
  allow_guests   INTEGER NOT NULL CHECK (allow_guests IN (0,1)) DEFAULT 0,
  allow_multiple INTEGER NOT NULL CHECK (allow_multiple IN (0,1)) DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at     TEXT,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_polls_owner ON polls(owner_id);
CREATE INDEX IF NOT EXISTS idx_polls_status ON polls(status);

-- -----------------------
-- Poll options
-- -----------------------
CREATE TABLE IF NOT EXISTS poll_options (
  id         TEXT PRIMARY KEY,
  poll_id    TEXT NOT NULL,
  text       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_options_poll ON poll_options(poll_id);

-- -----------------------
-- Votes
-- -----------------------
CREATE TABLE IF NOT EXISTS votes (
  id          TEXT PRIMARY KEY,
  poll_id     TEXT NOT NULL,
  option_id   TEXT NOT NULL,
  user_id     TEXT,
  guest_token TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
  FOREIGN KEY (option_id) REFERENCES poll_options(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,

  CHECK (
    (user_id IS NOT NULL AND guest_token IS NULL)
    OR
    (user_id IS NULL AND guest_token IS NOT NULL)
  )
);

-- Un vote max par option pour un user
CREATE UNIQUE INDEX IF NOT EXISTS uq_votes_user_option
ON votes(option_id, user_id)
WHERE user_id IS NOT NULL;

-- Un vote max par option pour un invité
CREATE UNIQUE INDEX IF NOT EXISTS uq_votes_guest_option
ON votes(option_id, guest_token)
WHERE guest_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_votes_poll ON votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_votes_option ON votes(option_id);
