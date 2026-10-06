-- Accounts, sessions, projects and Monthly Report events (see golive-plan.md).
-- A project or event is one row; its nested parts (activities, to-dos) stay in the `data` JSON,
-- and who takes part in it is copied to plan_members / event_assignees so it can be looked up by index.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'USER')),
  -- "pbkdf2$<iterations>$<salt b64>$<hash b64>", or "sha256$<hex of username:password>" (rehashed at sign-in)
  password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Only the SHA-256 of the cookie's token is kept.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users (id),
  responsible_id TEXT REFERENCES users (id),
  year INTEGER NOT NULL,
  data TEXT NOT NULL, -- WorkPlan JSON
  updated_at TEXT NOT NULL
);
CREATE INDEX plans_owner_year ON plans (owner_id, year);
CREATE INDEX plans_year ON plans (year);

-- The accounts responsible for a project or one of its activities; rewritten at every save.
CREATE TABLE plan_members (
  plan_id TEXT NOT NULL REFERENCES plans (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id),
  PRIMARY KEY (plan_id, user_id)
);
CREATE INDEX plan_members_user ON plan_members (user_id);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users (id),
  data TEXT NOT NULL, -- CalendarEvent JSON
  updated_at TEXT NOT NULL
);
CREATE INDEX events_owner ON events (owner_id);

CREATE TABLE event_assignees (
  event_id TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX event_assignees_user ON event_assignees (user_id);
