# Run Content Studio locally with R2

## What happens

Generate text and images → automatically upload each image to R2 → show its public URL in Content Studio → review → copy URLs or export JSON for your database later.

All 18 image slots use this flow: the concept image, three learning steps, two alternate examples and twelve assessment questions. Individual image generation buttons also upload automatically. No database connection or publishing has been added.

## 1. Configure your Cloudflare bucket

1. Create an R2 bucket for these images.
2. Create R2 S3 API credentials with **Object Read & Write** permission scoped to this bucket. Save the Access Key ID and Secret Access Key. These are separate from your Workers AI API token.
3. In the bucket settings, enable a **Public Development URL** for local testing, or connect a custom domain for production image delivery. Images under this public domain can be viewed by anyone who has their URL.
4. Copy the public base URL, for example `https://pub-EXAMPLE.r2.dev` or `https://images.yourdomain.com`. Do not use the `r2.cloudflarestorage.com` S3 endpoint here.

Cloudflare references: [S3 SDK configuration](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/) and [public bucket URLs](https://developers.cloudflare.com/r2/buckets/public-buckets/).

## 2. Add local credentials

Copy `.env.example` to `.env` in this project folder, then fill in:

```dotenv
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=your-accessible-gemini-model
CLOUDFLARE_API_TOKEN=your-workers-ai-token
CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET_NAME=your-bucket-name
R2_PUBLIC_BASE_URL=https://your-public-bucket-domain
PORT=3000
```

Keep `.env` on your machine. Credentials are used only by the local server; they are not embedded in the page or exported JSON. Restart the server after changing `.env`.

## 3. Start

With Node.js 22 or newer installed, open a terminal in this project folder:

```sh
npm install
npm start
```

Open http://localhost:3000/curriculum.html. Generate/select a curriculum, then open Content Studio. The image status will show **Cloudflare Workers AI + R2 upload** once all required settings are present. This indicates configuration is present; an actual generation verifies the credentials and bucket permissions.

## 4. Try one image first

1. Enter an image brief under Mission intro and click **Generate Image**.
2. Wait for generation and upload to finish.
3. The Concept Image URL field will contain an HTTPS URL. Copy it into a new browser tab to verify public delivery.
4. Review the preview. The same URL is included in `learning_content.image_url` in the JSON.
5. Generate all content with **Generate the matching pictures too** checked to process the full batch. Each learning step, alternate example and question receives its own URL.

Uploads use unique keys like `content/2026-09-28/<unique-id>.jpg`. Regeneration creates a new object, so it does not overwrite images already used elsewhere. Uploaded objects remain in R2 if you discard or clear a draft; remove unused objects from the bucket when appropriate. Editor text, question banks and hosted image URLs now save automatically in this browser for each mapped concept. The status strip reports saving and restoration. Download the JSON package for a portable copy.

## Troubleshooting

- **R2 setup needed:** Fill in the named `.env` settings and restart.
- **R2 upload failed:** Check the bucket name, account ID, S3 credentials and Object Read & Write permission. Existing image fields remain unchanged when individual regeneration fails.
- **URL shows 403/404:** Confirm the public domain is enabled and belongs to the same bucket. Upload credentials alone do not enable public delivery.
- Browser CORS for uploads is unnecessary: the local server performs the R2 upload. Local image previews and downloads use the returned image bytes.
- This local server listens on loopback only. No deployment is required.

## Verification

Run `npm test`. The tests include upload bytes and MIME type, unique object keys, public URLs, missing configuration, upload failures, editor URL preservation and all 18 image targets. Provider calls are mocked. A live upload must be checked after adding real credentials.

## Manual ChatGPT content

Click Continue with ChatGPT at the top of Content Studio. Step 1 copies a prompt for the selected curriculum, or you can expand Use a different topic and concept to set your own. Paste the prompt into ChatGPT. In Step 2, paste the complete response or choose its JSON file, then click Add content JSON. The server checks it before replacing the editor.

The import opens the learning screens for review. Click Generate all images separately when ready. It processes the concept image, three screens, two alternate examples and twelve questions, and uploads their pictures to R2. Use Generate missing images to retry empty slots while preserving existing URLs. Progress and cancellation controls appear on Setup.

No Gemini or OpenAI API key is required for manual text import. Cloudflare and R2 credentials are still needed for pictures.