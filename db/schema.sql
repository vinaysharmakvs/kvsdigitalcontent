CREATE SCHEMA IF NOT EXISTS kidsverse;
CREATE TABLE IF NOT EXISTS kidsverse.curricula (
 id uuid PRIMARY KEY,
 board text NOT NULL, grade text NOT NULL, subject text NOT NULL,
 version integer NOT NULL CHECK(version > 0),
 source text NOT NULL CHECK(source IN ('gemini','import','manual')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(board,grade,subject,version)
);
CREATE TABLE IF NOT EXISTS kidsverse.topics (
 id uuid PRIMARY KEY,
 curriculum_id uuid NOT NULL REFERENCES kidsverse.curricula(id) ON DELETE CASCADE,
 name text NOT NULL, position integer NOT NULL CHECK(position >= 0),
 UNIQUE(curriculum_id,name), UNIQUE(curriculum_id,position)
);
CREATE TABLE IF NOT EXISTS kidsverse.concepts (
 id uuid PRIMARY KEY,
 topic_id uuid NOT NULL REFERENCES kidsverse.topics(id) ON DELETE CASCADE,
 name text NOT NULL, objective text NOT NULL,
 position integer NOT NULL CHECK(position >= 0),
 UNIQUE(topic_id,name), UNIQUE(topic_id,position)
);
