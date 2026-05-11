# Deploy to Cloudflare Pages

This project can run on Cloudflare Pages with Pages Functions.

## What changed

- Static files are served directly by Cloudflare Pages.
- `/api/*` is handled by `functions/api/[[path]].js`.
- The Function proxies requests to `https://api.magnific.com/v1/ai/*`.
- If `MAGNIFIC_API_KEY` is configured as a Cloudflare secret, users do not need to enter an API key in the browser.
- If no secret is configured, the app falls back to the browser API key stored in `localStorage`.

## Local development

For the current Express server:

```bash
npm start
```

Open:

```text
http://localhost:3000
```

To run with a server-side API key locally:

```bash
MAGNIFIC_API_KEY="your_api_key_here" npm start
```

## Cloudflare setup

Install and login to Wrangler:

```bash
npm install
npx wrangler login
```

Create the Pages project:

```bash
npx wrangler pages project create kling-motion
```

Set the Magnific API key as a Pages secret:

```bash
npx wrangler pages secret put MAGNIFIC_API_KEY --project-name kling-motion
```

Deploy:

```bash
npm run pages:deploy
```

After deploy, Cloudflare prints a public URL. Open that URL from any device.

## Git-based deployment

If deploying from the Cloudflare dashboard:

- Framework preset: `None`
- Build command: leave empty
- Build output directory: `/`
- Functions directory: `functions`
- Add environment secret: `MAGNIFIC_API_KEY`

## Notes

The app still uploads local files to `tmpfiles.org` before sending them to Magnific, because Magnific requires publicly accessible `image_url` and `video_url` inputs.
