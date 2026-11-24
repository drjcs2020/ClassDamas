CREATE TABLE student_changes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  house TEXT NOT NULL CHECK (house IN ('A','B','C')),
  team TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

ALTER TABLE matches ADD COLUMN creator_house TEXT;
ALTER TABLE matches ADD COLUMN recipient_house TEXT;
