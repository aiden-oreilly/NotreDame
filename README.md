# Domer OS

A living 3D model of the University of Notre Dame: real building footprints, aerial imagery, 140 years of campus history, four seasons, live weather, your class schedule from Google Calendar, walking routes on the real path network, and a Dispatch queue for the work around it.

## What it is built from

| Layer | Source | Notes |
|---|---|---|
| Buildings, walks, lakes, land use | OpenStreetMap via Overpass (ODbL) | `scripts/fetch-campus.mjs` → `campus.json` in Supabase Storage |
| Ground and roofs | Esri World Imagery tiles, streamed in the browser | Swap `VITE_IMAGERY_URL` for a licensed orthophoto (e.g. the University's own) before any commercial use |
| Heights, construction years, short codes | `src/data/meta.js` | Curated; drives the Time Machine |
| Trees | Detected from canopy in the aerial photo + OSM tree nodes | `src/engine/trees.js` |
| Weather | Open-Meteo (no key) | Live mode only |
| Accounts, courses, queue, decision log | Supabase (Postgres + RLS + Realtime) | `supabase/migrations` |

## Stack

- **Vite + Three.js** (no framework). Post-processing: GTAO, bloom, a film-grade pass for the history eras, ACES tone mapping.
- **Supabase**: project `domer-os` (`gcrqhvfdqhtjowfhiebu`). Tables `profiles`, `courses`, `dispatch_cards`, `decisions` (append-only), `buildings_meta`. Every row is private to its owner via RLS. Public bucket `campus` holds the geometry.
- **Vercel**: static build + one function, `api/ics.js`, which fetches a private iCal feed on the user's behalf (allow-listed hosts only, nothing stored).
- **GitHub**: this repository; pushes to `main` deploy to production.

## Run locally

```bash
npm install
npm run dev
```

Defaults for the Supabase URL, publishable key and campus data URL live in `src/config.js`; override with `.env` (see `.env.example`).

## Refresh campus data

```bash
SUPA_URL=https://gcrqhvfdqhtjowfhiebu.supabase.co SUPA_KEY=<service_role key> npm run data
```

## Turn on one-click Google Calendar

The secret-iCal-link and `.ics` upload paths work with no setup. For the one-click button:

1. Google Cloud Console → create an OAuth client (Web). Authorized redirect URI: `https://gcrqhvfdqhtjowfhiebu.supabase.co/auth/v1/callback`.
2. Enable the **Google Calendar API** for that project; add the scope `https://www.googleapis.com/auth/calendar.readonly` to the consent screen.
3. Supabase dashboard → Authentication → Providers → Google: paste the client ID and secret.
4. Supabase → Authentication → URL Configuration: set **Site URL** to the production domain and add it to **Redirect URLs**.
5. Vercel → Project → Environment Variables: `VITE_GOOGLE_OAUTH=1`, redeploy.

## Architecture

```
src/
  main.js            boot, world state, render loop, picking, routing API
  engine/
    renderer.js      WebGL renderer, composer, era film grade
    sky.js           physical sky, solar ephemeris for South Bend, stars, environment map
    ground.js        imagery stitching, seasonal ground shader, painted historic ground
    buildings.js     extruded OSM footprints, era time-lapse in the vertex shader, facades, photo roofs, stadium bowl
    landmarks.js     Golden Dome, Basilica spire, Hesburgh mural wall, Grotto, stadium turf, lost structures
    trees.js         canopy detection, instanced seasonal trees
    environment.js   lakes and ice, weather particles, lamp posts
    route.js         walking graph from OSM paths, Dijkstra, animated route
    camera.js        orbit controls, cinematic flights, tour drift
  app/
    store.js         local-first state mirrored to Supabase
    calendar.js      iCalendar parser, Google Calendar API, recurring-class detection
    ui.js            panels, building card, labels, time machine, palette, tour
api/ics.js           calendar proxy
scripts/             data pipeline
supabase/migrations  schema
```

## Attribution

© OpenStreetMap contributors. Imagery © Esri, Maxar, Earthstar Geographics. Weather by Open-Meteo. Not affiliated with or endorsed by the University of Notre Dame; "Notre Dame" is used descriptively.

## Course catalog (v3)
Every section Notre Dame publishes in PATH Class Search (classsearch.nd.edu) is mirrored into Supabase (`nd_terms`, `nd_sections`): course number, CRN, section, credits, days and times, dates, seats, waitlist, Core attributes, restrictions, cross-lists. The app searches it through the `search_sections` RPC.
Refresh: `TERMS=202610,202620 SUPABASE_SERVICE_ROLE_KEY=... npm run courses` (about 15 minutes for two terms; polite rate of 5 requests at a time).
Rooms and instructors are only shown by ND after NetID sign-in, so they are not in the public mirror. They arrive with Okta (below) or from the student's own calendar import.

## Okta (Notre Dame NetID)
Sign-in goes through `src/app/auth.js`. Okta is pre-wired as SAML 2.0 SSO via Supabase Auth (requires the Supabase Pro plan):
1. ND OIT creates a SAML app in Okta. ACS URL: `https://gcrqhvfdqhtjowfhiebu.supabase.co/auth/v1/sso/saml/acs`. Entity ID: `https://gcrqhvfdqhtjowfhiebu.supabase.co/auth/v1/sso/saml/metadata`. Attributes: email, netid (uid), given_name, family_name, eduPersonPrimaryAffiliation.
2. `supabase sso add --type saml --metadata-url <okta-metadata-url> --domains nd.edu --project-ref gcrqhvfdqhtjowfhiebu`
3. In Vercel set `VITE_SSO=okta` and `VITE_SSO_DOMAIN=nd.edu`, redeploy. The "Notre Dame NetID" button goes live; `ndIdentity()` exposes netid, name and affiliation to the app.
