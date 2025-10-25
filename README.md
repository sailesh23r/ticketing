# XLTER Ticketing System (Next.js + Convex + Better Auth)

Production-ready setup for a LAN-accessible ticketing system with:

- Next.js App Router + TypeScript + shadcn/ui
- Better Auth (email/password, 2FA, Microsoft OAuth, JWT ES256)
- Convex (self-hosted via Docker) for data + server logic
- PM2 for Windows process management

This guide is tuned for Windows 10/11 and makes the app reachable from other devices on your Wi‑Fi.

## Quick start (Windows)

1) Prereqs

- Install Git, Node.js 18+ (or 20.x), npm, Docker Desktop (WSL2 backend)
- Optional: Postgres if you run auth DB locally

2) Clone & install

```
git clone <your-repo-url>
cd ticketing system/new
npm ci
```

3) Configure LAN IP automatically

```
cd ..
./scripts/setup.ps1 -UpdateDev -UpdateCwd
```

- Pass `-Ip 192.168.x.x` to override auto-detection
- `-UpdateCwd` updates `new/ecosystem.config.js` cwd to the current path
- This updates: `/.env`, `/new/.env.production.local`, and `/new/.env.local` (dev)

4) Start Convex backend (Docker)

```
docker compose up -d
```

5) Build & run Next.js

Option A: PM2 (recommended)

```
cd new
npm run build
npx pm2 start ecosystem.config.js --update-env
```

Option B: Plain Next.js

```
cd new
npm run build
npm run start
```

6) Open from another device on Wi‑Fi

- App: `http://<YOUR_PC_IP>:3000`
- Convex health: `http://<YOUR_PC_IP>:3210/version`
- Convex dashboard: `http://<YOUR_PC_IP>:6791`

If Windows prompts about firewall, allow access. Or add rules (Admin PowerShell) for ports 3000/3210/6791.

## Environment variables

Key files you’ll customize per machine/IP:

- `/.env` (root): Convex Docker + JWT + public origins
- `/new/.env.production.local`: Next + Better Auth + public Convex URL
- `/new/.env.local` (dev): Optional, align to the same IP for npm run dev

The setup script writes typical values like:

- `AUTH_JWT_ISSUER/AUDIENCE/JWKS` -> `http://<IP>:3000`
- `NEXT_PUBLIC_CONVEX_URL` -> `http://<IP>:3210`
- `BETTER_AUTH_TRUSTED_ORIGINS` includes the LAN origin

## PM2 notes (Windows)

- Edit `new/ecosystem.config.js` and set `cwd` to your actual path
- It binds `-H 0.0.0.0` so the app is reachable over LAN
- Restart after env changes: `npx pm2 restart ecosystem.config.js --update-env`

## Troubleshooting

- App opens but no Convex data:
	- In DevTools → Network: `/api/auth/token` must be 200 with `{ token }`
	- Calls to `http://<IP>:3210` should be 200 (not 401/403)
	- If logs show `Invalid origin http://<IP>:3000`, add it to `BETTER_AUTH_TRUSTED_ORIGINS` or `trustedOrigins` in `new/lib/auth.ts`, rebuild, restart

- Convex health OK but app can’t reach it:
	- Check `NEXT_PUBLIC_CONVEX_URL` points to `http://<IP>:3210`
	- Ensure Windows Firewall allows 3210 inbound

- Cookies/session issues over HTTP:
	- We set `secure: false; sameSite: "lax"` in `new/lib/auth.ts` for LAN HTTP
	- For HTTPS, set `secure: true` and `SameSite=None`, and serve over TLS

- New machine / IP changed:
	- Re-run `./scripts/setup-lan.ps1 -UpdateDev`
	- `docker compose down && docker compose up -d`
	- `npm run build` and restart PM2 or `npm run start`

## Optional integrations

- Microsoft OAuth: Update Azure redirect URIs to the current origin (`http://<IP>:3000/...`)
- SMTP & Push: Keep the same env secrets or replace with new ones

## Deploy to Coolify (cyberloop.xeltr.com)

- Domain/DNS
  - Point cyberloop.xeltr.com to your VPS (A record)
  - If you host Convex separately, also point convex.cyberloop.xeltr.com to its service
- App (Next.js) setup
  - Build: `npm ci && npm run build`
  - Start: `npm run start` (Coolify sets PORT)
  - TLS: enable Let’s Encrypt in Coolify for cyberloop.xeltr.com
- Environment (set in Coolify)
  - NEXT_PUBLIC_AUTH_BASE_URL=https://cyberloop.xeltr.com
  - BETTER_AUTH_URL=https://cyberloop.xeltr.com
  - AUTH_JWT_ISSUER=https://cyberloop.xeltr.com
  - AUTH_JWKS_URL=https://cyberloop.xeltr.com/api/auth/jwks
  - AUTH_JWT_AUDIENCE=https://cyberloop.xeltr.com
  - NEXT_PUBLIC_CONVEX_URL=https://convex.cyberloop.xeltr.com
  - BETTER_AUTH_SECRET=REPLACE
  - DATABASE_URL=REPLACE
  - SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM
  - MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRETVALUE
- Convex
  - Expose HTTPS endpoint (subdomain or path). Ensure WebSocket upgrades are allowed.
  - Health: `https://convex.cyberloop.xeltr.com/version` should return 200
- Verify after deploy
  - /login → sign in → redirected to `/new-dash`
  - /api/auth/session returns your session JSON when logged in
  - /api/auth/token returns `{ token }`
  - Cookies are Secure, SameSite=Lax
  - Convex queries/subscriptions succeed (wss upgrades)

## License

Private/internal project. Replace this section if you plan to open source.
