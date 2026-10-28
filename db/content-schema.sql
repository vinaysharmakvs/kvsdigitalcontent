CREATE SCHEMA IF NOT EXISTS cms_content;
CREATE TABLE IF NOT EXISTS cms_content.packages (
 id uuid PRIMARY KEY, payload_sha256 text NOT NULL UNIQUE,
 payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cms_content.curricula (
 id uuid PRIMARY KEY, board text NOT NULL, grade text NOT NULL, UNIQUE(board,grade)
);
CREATE TABLE IF NOT EXISTS cms_content.subjects (
 id uuid PRIMARY KEY, curriculum_id uuid NOT NULL REFERENCES cms_content.curricula(id),
 name text NOT NULL, UNIQUE(curriculum_id,name)
);
CREATE TABLE IF NOT EXISTS cms_content.topics (
 id uuid PRIMARY KEY, subject_id uuid NOT NULL REFERENCES cms_content.subjects(id),
 name text NOT NULL, UNIQUE(subject_id,name)
);
CREATE TABLE IF NOT EXISTS cms_content.concepts (
 id uuid PRIMARY KEY, topic_id uuid NOT NULL REFERENCES cms_content.topics(id),
 name text NOT NULL, UNIQUE(topic_id,name)
);
CREATE TABLE IF NOT EXISTS cms_content.themes (
 id uuid PRIMARY KEY, name text NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS cms_content.content_packages (
 package_id uuid PRIMARY KEY REFERENCES cms_content.packages(id),
 concept_id uuid NOT NULL REFERENCES cms_content.concepts(id),
 theme_id uuid NOT NULL REFERENCES cms_content.themes(id),
 learning_objective text NOT NULL, content_type text NOT NULL,
 learn_required boolean NOT NULL, step_order jsonb NOT NULL, starts_quiz_after text NOT NULL,
 extra jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS cms_content.learning_content (
 id uuid PRIMARY KEY, package_id uuid NOT NULL UNIQUE REFERENCES cms_content.content_packages(package_id),
 teaching_method text NOT NULL, explanation text NOT NULL, image_url text NOT NULL,
 image_prompt text, image_alt text, hints jsonb NOT NULL, nova_script text NOT NULL,
 nova_feedback text, extra jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS cms_content.learning_steps (
 id uuid PRIMARY KEY, package_id uuid NOT NULL REFERENCES cms_content.content_packages(package_id),
 position integer NOT NULL, step_key text NOT NULL, title text, teaching_text text NOT NULL,
 key_idea text NOT NULL, image_url text NOT NULL, image_prompt text, image_alt text,
 nova_script text NOT NULL, mini_question jsonb NOT NULL, extra jsonb NOT NULL,
 UNIQUE(package_id,position), UNIQUE(package_id,step_key)
);
CREATE TABLE IF NOT EXISTS cms_content.example_alternatives (
 id uuid PRIMARY KEY, step_id uuid NOT NULL REFERENCES cms_content.learning_steps(id),
 position integer NOT NULL, label text, teaching_text text NOT NULL, key_idea text NOT NULL,
 image_url text NOT NULL, image_prompt text, image_alt text, nova_script text NOT NULL,
 mini_question jsonb NOT NULL, extra jsonb NOT NULL, UNIQUE(step_id,position)
);
CREATE TABLE IF NOT EXISTS cms_content.missions (
 id uuid PRIMARY KEY, package_id uuid NOT NULL UNIQUE REFERENCES cms_content.content_packages(package_id)
);
CREATE TABLE IF NOT EXISTS cms_content.tests (
 id uuid PRIMARY KEY, package_id uuid NOT NULL UNIQUE REFERENCES cms_content.content_packages(package_id),
 one_time boolean NOT NULL
);
CREATE TABLE IF NOT EXISTS cms_content.challenges (
 id uuid PRIMARY KEY, package_id uuid NOT NULL UNIQUE REFERENCES cms_content.content_packages(package_id),
 one_time boolean NOT NULL
);
CREATE TABLE IF NOT EXISTS cms_content.questions (
 id uuid PRIMARY KEY, package_id uuid NOT NULL REFERENCES cms_content.content_packages(package_id),
 bank text NOT NULL CHECK(bank IN ('cfu','test','battle','challenge')), position integer NOT NULL,
 mission_id uuid REFERENCES cms_content.missions(id), test_id uuid REFERENCES cms_content.tests(id),
 challenge_id uuid REFERENCES cms_content.challenges(id),
 question text NOT NULL, options jsonb NOT NULL, answer text NOT NULL, difficulty text NOT NULL,
 explanation text NOT NULL, hints jsonb NOT NULL, xp integer NOT NULL, marks integer NOT NULL,
 nova_feedback text, nova_script text NOT NULL, image_url text NOT NULL,
 image_prompt text, image_alt text, extra jsonb NOT NULL, UNIQUE(package_id,bank,position)
);
