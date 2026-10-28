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

## New API only

The CMS now uses only `https://kidsverse-apinew.vercel.app/api/v1/` for saved curriculum and content. Push to DB forwards a complete package to `admin/content/feed`. `/api/live-content?target=tree` forwards to `curriculum/tree`; target=packages forwards to `admin/content/packages`; target=package&id=UUID reads `admin/content/packages/UUID`. The reader allows only these fixed routes and forwards only supported filters. Secrets remain server-side.

The original `/api/curricula` and local demo `/api/content/ingest` routes return 410. Neither publishing nor reading calls the original database. Earlier records have not been deleted. Existing DATABASE_URL credentials remain unchanged but are not used by active CMS routes.

Browser mappings and studio drafts now use new storage keys. Old cached selections/drafts are ignored, not erased. Subject/class changes load the new API instead of restoring previous subject caches. API failures show explicitly and never load data from the old database. A complete generated curriculum cannot be independently saved because the backend has no bulk topic-create route; publish the selected concept with a complete content package.

In Review & export, **Find saved packages** lists packages for the exact current class, board, subject, topic and concept. Select a package and click **Load from new API** to read lessons, alternate examples, question banks and hosted URLs into the editor. Replacing the editor asks for confirmation. The readback status identifies the new API and package ID. No generation or image calls are made during loading.

The backend's confirmed routes returned HTTP 500 during the October 28 connection check. Those external errors must be fixed before curriculum and question readback can be demonstrated against live data; the CMS does not claim a successful remote save/read when that API fails.
