# my-web-app

A small Express + EJS blogging app with user registration + posts stored in SQLite. This repository includes a simple web front-end (EJS) and server routes for authentication, creating/editing posts, and viewing single posts.

This README covers:

- local setup and running
- environment variables
- available npm scripts
- Render cron job setup (secure `/cron/ping` endpoint)
- tips for deployment and development

## Quick start (local)

1. Install dependencies

```powershell
npm install
```

2. Create a `.env` file in the project root. Minimum required variables:

```
PORT=4000
JWTSECRET=some_long_random_secret
API_URL=https://example.com/ping      # optional: the URL the cron endpoint should call
CRON_SECRET=a_different_secret       # used to secure /cron/ping
NODE_ENV=development
```

3. Run the dev server (nodemon):

````powershell
npm run dev
# my-web-app

A small Express + EJS blogging app (SQLite) with authentication and a small web UI. This README explains local setup, environment variables, npm scripts, and how to configure a secure Render Cron job to call the built-in `/cron/ping` endpoint.

## Quick start (local)

1. Install dependencies

```powershell
npm install
````

2. Create a `.env` file in the project root with at least these variables:

```env
PORT=4000
JWTSECRET=your_jwt_secret_here
API_URL=https://example.com/ping    # optional: targeted URL that /cron/ping will GET
CRON_SECRET=replace_with_a_secret   # choose a strong secret for the cron route
NODE_ENV=development
```

3. Start the app for development:

```powershell
npm run dev
```

Or start normally:

```powershell
npm start
```

4. Open http://localhost:4000 in your browser.

## Project layout

- `server.js` — Express routes and app entry
- `views/` — EJS templates
- `public/` — static assets (CSS, JS, images)
- SQLite DB created automatically when the app runs

## Important npm scripts

- `npm start` — production start (node server.js)
- `npm run dev` — dev start (nodemon)

## Environment variables (summary)

- `PORT` — port to listen on (default 4000)
- `JWTSECRET` — required for authentication cookies
- `API_URL` — optional: the URL the cron handler will call
- `CRON_SECRET` — protects `GET /cron/ping` (must match header `X-Cron-Secret`)
- `NODE_ENV` — set to `production` for production

## Secure Render Cron (step-by-step)

This repository exposes `GET /cron/ping` to be used by a platform cron. The route requires a header `X-Cron-Secret` whose value must equal your `CRON_SECRET` environment variable.

Follow these steps to configure a Render Cron job that securely calls your route:

1. Deploy or confirm your service is live on Render.

2. Choose a strong secret and set it as an environment variable for your service:

PowerShell (generate a 64-char hex secret):

```powershell
[System.BitConverter]::ToString((New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes(32)).Replace('-', '').ToLower()
```

Or with Node:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the generated string and add it to Render → Services → Your Service → Environment → Environment Variables as `CRON_SECRET`.

3. Create the Cron Job in Render:

- Dashboard → Cron Jobs → New Cron Job
- Type: HTTP Request
- URL: `https://<your-service>.onrender.com/cron/ping` (or select your service internally if Render offers calling the service directly)
- Method: GET
- Headers (Advanced): add `X-Cron-Secret` with the exact secret string you set in the environment variable above
- Schedule: choose your cron expression (examples below)
- Timezone: choose your timezone

Important: Render's Cron UI does not substitute service env vars into header values. Paste the same literal secret string into the Cron job header value and into your service's `CRON_SECRET` variable.

4. (Optional) Set `API_URL` in your service environment variables if your cron handler needs to call an external URL. Confirm that URL is reachable from the Render environment.

## Example schedules (cron expressions)

- Every 15 minutes: `*/15 * * * *`
- Hourly on the hour: `0 * * * *`
- Daily at 03:00: `0 3 * * *`

Use https://crontab.guru to verify expressions.

## Test the route manually (before relying on scheduled runs)

PowerShell:

```powershell
Invoke-RestMethod -Uri 'https://your-service.onrender.com/cron/ping' -Headers @{'X-Cron-Secret'='PASTE_YOUR_SECRET_HERE'} -Method GET -Verbose
```

curl:

```bash
curl -i -H "X-Cron-Secret: PASTE_YOUR_SECRET_HERE" https://your-service.onrender.com/cron/ping
```

If the secret matches and the handler succeeds, you should receive HTTP 200 and any success message from the route. If the secret is missing or incorrect the server should reject the request (check logs).

## Debugging / troubleshooting

- Header mismatch: ensure the literal string in the Cron job header equals the `CRON_SECRET` env var on the service.
- Service visibility: if your service is private, use Render's option to call the service internally from the Cron job or make the endpoint public over HTTPS.
- View Cron job run logs: Cron Jobs → select job → runs — Render shows status and response body.
- View service logs: Services → Your Service → Logs — watch for server-side errors when the cron runs.
- Upstream/API errors: `/cron/ping` performs an outbound GET to `API_URL`. If that request fails, /cron/ping may return 502 or 500 — inspect logs and try hitting `API_URL` from a different environment to verify reachability.
- Use the Cron job "Run Now" or Test button to trigger an immediate run for debugging.

## Security notes

- Keep `CRON_SECRET` and `JWTSECRET` out of code and store them as platform env vars.
- Rotate `CRON_SECRET` periodically and update the Cron job header value in Render.
- If you need stronger protection, consider adding an HMAC signature + timestamp verification instead of a single header string (I can help implement this).

## Helpful additions (optional)

- Add a `/cron/status` endpoint to report the last successful ping time (server-side storage).
- Implement HMAC verification for Cron calls (server and Cron job changes required).
- Create a dedicated worker if you want a single process handling scheduled work instead of the platform Cron approach.

## Endpoints of interest

- `GET /` — homepage
- `POST /register`, `POST /login` — auth
- `GET /create-post`, `POST /create-post` — create post
- `GET /post/:id` — view post
- `GET /cron/ping` — the secure cron endpoint (requires `X-Cron-Secret` header)

---

If you want, I can also:

- Add a small `/cron/status` endpoint that reports the last successful ping time.
- Add a `worker.js` and `npm run start-worker` so you can deploy a worker on Render instead of using platform Cron.
- Implement HMAC-based verification for added security.

Tell me which option you'd like next and I will implement it.
