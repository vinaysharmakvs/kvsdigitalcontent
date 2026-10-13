# Neon curriculum library

The local mapping page is connected to Neon through server-only DATABASE_URL in .env. Run `npm run db:init` on a new database. The migration is additive and uses a dedicated `kidsverse` schema.

## Tables

- `kidsverse.curricula`: UUID, board, grade, subject, integer version, source, creation timestamp. The combination of board, grade, subject and version is unique.
- `kidsverse.topics`: UUID, curriculum foreign key, name and display position.
- `kidsverse.concepts`: UUID, topic foreign key, name, objective and display position.

Each save inserts a complete new snapshot in one transaction. Earlier versions remain available in the database; the page loads the latest. Topic and concept IDs belong to that snapshot. This phase stores curriculum mappings, not generated lessons, questions or image records. Saves from the page are marked manual because they are reviewed by the author.

## Using the page

1. Select board, grade and subject. The page checks Neon automatically.
2. If there is no browser draft, a saved mapping loads automatically. Existing browser drafts are preserved; click Load from database to replace one explicitly.
3. Generate with Gemini or use Continue with ChatGPT to import `{ "topics": [{ "name": "Topic", "concepts": [{ "name": "Concept", "objective": "Learning objective" }] }] }`.
4. Review the mapping and edit learning objectives. Click Save entire curriculum to database. This saves every topic and concept for the selected combination.
5. Select a concept and open Content Studio as before. Return later to reuse the database mapping without generation.

Imports allow 1–200 topics and 1–200 concepts per topic, subject to the 2 MB save request limit. Save one board/grade/subject combination at a time. A stale-version conflict requires loading the latest mapping before resaving. State Board currently uses the application's existing shared label; add distinct state names before storing curricula for different states.

## API and scope

Local `GET /api/curricula?board=CBSE&grade=Grade+1&subject=Mathematics` returns the latest mapping. `POST /api/curricula` takes these fields plus topics and expectedVersion (zero for the first save). SQL is parameterized; concurrent saves are serialized per combination.

This database API is enabled in the localhost server only. The existing Vercel handler has not been enabled for database access. Add author authentication before exposing database editing on a public deployment.

## Tests

`npm test` runs validation and existing application tests without database credentials. `node --env-file=.env db/verify.mjs` checks live save/load, version preservation and stale-save protection using uniquely named temporary test data, then removes only those test records.

Keep DATABASE_URL out of Git and shared archives. Rotate the password shared in chat using the Neon console and update .env, then restart the server.
