# LA PRESENTAZIONE - Residence Space Reservation

Complete web app to manage shared-space reservations in a residence.

## Features

- TV Room and Music Room availability
- reservation creation with field validation
- automatic overlap prevention for same space/date
- reservation list filtered by space and date
- reservation cancellation with unique code
- local JSON data persistence

## Requirements

- Node.js 18 or newer
- npm

## Quick start

```bash
cd /Users/gms/residenza-prenotazioni
npm install
npm run dev
```

Open `http://localhost:3000/reservation` in your browser.

## Available scripts

- `npm start`: start server
- `npm run dev`: start in watch mode
- `npm run reset-data`: reset spaces and reservations

## Structure

- `server.js`: backend API + frontend static hosting
- `public/`: web UI (`index.html`, `styles.css`, `app.js`)
- `data/`: data files (`spaces.json`, `reservations.json`)
- `scripts/reset-data.js`: reset seed data
- `lib/default-data.js`: default dataset

## Main API routes

- `GET /reservation/api/spaces`
- `GET /reservation/api/reservations?spaceId=...&date=YYYY-MM-DD`
- `POST /reservation/api/reservations`
- `DELETE /reservation/api/reservations/:id`
