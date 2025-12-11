# Preview Environment

## Goals
- Mirror production behavior while allowing local development.

## Modes
- Development: `npm run dev` serves API + Vite middleware on `http://localhost:3000`.
- Production preview: `npm run build` then `npm start` (set `PORT` as needed).

## Commands
- Dev: `npm run dev`
- Client-only dev (optional): `npm run dev:client`
- Build: `npm run build`
- Start (production bundle): `PORT=3001 npm start`

## Environment
- Required: `DATABASE_URL`, `SESSION_SECRET`, `EMPLOYEE_ACCESS_CODE`, `PORT` (optional, defaults to `3000`).
- AI: `SIGNALWIRE_SPACE_URL`, `SIGNALWIRE_PROJECT_ID`, `SIGNALWIRE_API_TOKEN`.

## Verification
- Server logs print `serving on port <PORT>`.
- Visit `http://localhost:<PORT>/` for client.
- Check `GET /api/health`, `GET /api/metrics`, `GET /api/ai/config`, `GET /api/ai/ping`.

