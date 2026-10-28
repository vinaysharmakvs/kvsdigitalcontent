# Kidsverse+ Content Studio

Map a curriculum, create or import a complete content draft, generate its pictures, review the child-facing preview, and export a JSON package. The Database button remains a placeholder.

## Run locally

Use Node.js 22 or newer. Run `npm ci`, copy `.env.example` to `.env`, fill in the providers you want to use, and run `npm start`. Open http://localhost:3000.

See [LOCAL-SETUP.md](LOCAL-SETUP.md) for Cloudflare Workers AI and R2 configuration. Keys stay on the server and are never included in prompts or exported packages.

## Author content

1. In Curriculum Mapping, choose grade, board and subject. Generate topics with Gemini or use Continue with ChatGPT to copy a curriculum prompt and import its JSON. Select a topic and concept, review the short learning objective, and click Save & open Content Studio. Save selection keeps the mapping in this browser without opening the next screen. Changing class, board or subject restores its saved mapping when available, or clears the previous topics so they cannot be used with the wrong subject.
2. In Content Studio, review the context and objective and add optional instructions. Generate all content uses Gemini. Continue with ChatGPT opens a two-step backup flow: copy the content prompt, generate it in ChatGPT, then paste or choose its JSON file and click Add content JSON. No Gemini or OpenAI API key is needed for manual text import.
3. ChatGPT import fills the objective, teaching copy, three learning screens, two alternate examples, twelve assessment questions, and eighteen image briefs. It opens the learning screens for review; it does not automatically spend image-provider quota.
4. Click Generate all images to create pictures and upload them to R2. Generate missing images preserves existing image URLs and processes only empty slots, including pictures that failed earlier. A failed picture does not stop the remaining queue. Progress is visible, and Stop pictures after this one keeps completed results.
5. Use the workspace tabs or the bottom Back / Next controls to inspect Setup, Learning screens, Questions, and Review & export. The coverage strip shows lesson, question and image counts. Each image URL has a Copy URL button.
6. Review the checklist and child-facing preview, then download the complete package. Generated curriculum and content need educational review before use.

Regenerate learning only keeps existing assessment questions. Complete regeneration and clearing a draft ask before replacing current work.

## Draft saving

Editor text, question banks, image URLs and settings save automatically in this browser, separately for each grade, board, subject, topic and concept. Refresh or return from Curriculum Mapping to restore a saved draft. The status strip reports whether saving succeeded. This is local browser storage, not a database or sync service; clearing browser data removes it. Download packages to keep a portable copy.

An already-open Content Studio follows mapping changes from another tab and builds both Gemini requests and ChatGPT prompts from the current selection. The previous concept's draft is saved before switching. If generation is running, the selection change waits until it finishes so content stays with the requested concept.

Images are hosted in R2 rather than embedded in the JSON. The local original-image download previews exist only for the current browser session; hosted URLs remain in saved drafts and exported packages. Discarding a draft does not delete uploaded R2 objects.

## Verification

Run `npm test`. Tests cover structured content, manual JSON import, provider failures, R2 uploads, all eighteen image slots, retrying empty slots, and restoring drafts. Provider requests in tests are mocked; live Gemini, Workers AI and R2 calls require configured credentials and have not been verified here.

## Push to DB: both destinations

Review & export → **Push to DB** makes one CMS request to `POST /api/publish-game`. The server validates the complete package, saves it to the original DATABASE_URL database's separate cms_content tables, and forwards it to the real external route `https://kidsverse-apinew.vercel.app/api/v1/admin/content/feed`. GAME_API_URL can override this route; the previously supplied /api/v1/ base is normalized to the confirmed feed route. Optional GAME_API_TOKEN remains server-only.

Each destination returns its own saved status, package IDs and question counts. HTTP 201 means both confirmed success; HTTP 207 means at least one destination did not confirm. The UI shows both results and only marks the complete request successful when both saved. Writes are not automatically retried. If a remote failure or timeout occurs, check that database before manually retrying. Two independent databases do not share a transaction; partial success is possible.

On October 28, 2026 the live feed accepted OPTIONS (200, POST allowed), but a full POST returned HTTP 500. Its curriculum/tree and curriculums GET routes also returned 500. These are external backend failures, not a missing CMS endpoint. No live remote success is claimed.

## Curriculum mapping scope

The existing /api/curricula API and kidsverse tables continue to store complete versioned mappings. Push to DB includes the selected board, grade, subject, topic, concept and objective in both content packages. The external repository exposes curriculum/tree for reading and a full content feed for writing, but no bulk curriculum/topic create route. Saving an entire generated mapping to the second database independently of lessons still requires an appropriate backend endpoint. Empty placeholder packages are never sent, because the backend publishes packages and replaces their existing questions.

## Local database demo

The separate local-only /api/content/ingest route remains available for the earlier demo. It uses DATABASE_URL and cms_content relational tables, without changing existing kidsverse curriculum tables. The direct demo route is not exposed by Vercel; the dual publishing service uses the same persistence function for the original destination. Earlier test records remain preserved.
