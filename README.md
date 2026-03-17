# LA PRESENTAZIONE - Residence Space Reservation

Complete web app to manage shared-space reservations in a residence.

## Features

- TV Room and Music Room availability
- unlimited booking hours (no opening/closing time restrictions)
- reservation creation with field validation
- maximum reservation duration: 4 hours
- automatic overlap prevention for same space/date
- existing reservations list shows all active (not expired) bookings
- user-defined cancellation PIN (4-8 digits)
- reservation cancellation restricted to owner (cancellation PIN + room number + full name)
- PostgreSQL persistence (Render-ready)

## Requirements

- Node.js 18 or newer
- npm
- PostgreSQL database
- `DATABASE_URL` environment variable

## Render setup

1. Create a PostgreSQL database on Render.
2. Copy the **Internal Database URL**.
3. In your Web Service, set env var:
   - `DATABASE_URL=<your-internal-database-url>`
4. Deploy the service.

The app auto-creates tables and seeds spaces (`TV Room`, `Music Room`) on startup.

## AWS Amplify Hosting setup (Express / web compute)

1. Push this repository to GitHub (including `amplify.yml` and `deploy-manifest.json`).
2. In Amplify, create a new app from the repository.
3. In Amplify app settings, set env var:
   - `DATABASE_URL=<your-postgres-url>`
4. Deploy.

Important:
- the Amplify build uses Node.js 22 (`amplify.yml`)
- the output bundle is generated in `.amplify-hosting`
- app URL must include `/reservation`

## Local quick start

```bash
cd /Users/gms/residenza-prenotazioni
npm install
export DATABASE_URL="postgres://USER:PASSWORD@HOST:PORT/DBNAME"
npm run dev
```

Open `http://localhost:3000/reservation` in your browser.

## Available scripts

- `npm start`: start server
- `npm run dev`: start in watch mode
- `npm run reset-data`: reset reservations and reseed spaces in PostgreSQL

## Structure

- `server.js`: backend API + frontend static hosting
- `public/`: web UI (`index.html`, `styles.css`, `app.js`)
- `scripts/reset-data.js`: reset seed data in DB
- `lib/default-data.js`: default space dataset
- `lib/database.js`: PostgreSQL connection, schema init and seed logic

## Main API routes

- `GET /reservation/api/spaces`
- `GET /reservation/api/reservations?activeOnly=true`
- `POST /reservation/api/reservations`
  - requires `cancellationPin` (4-8 digits)
  - rejects reservations longer than 4 hours
- `DELETE /reservation/api/reservations/:id`
  - requires `cancellationPin`, `roomNumber`, `residentName`
