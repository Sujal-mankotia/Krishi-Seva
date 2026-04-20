<<<<<<< HEAD
# KrishiSeva

A full-stack web application for managing farmer registrations, land records, scheme enrollments, and district-level analytics.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | HTML / CSS / JavaScript |
| Backend | Node.js + Express |
| Database | MongoDB Atlas or any MongoDB instance |

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create your environment file:

```bash
copy .env.example .env
```

3. Add your MongoDB connection string to `.env` or set `MONGODB_URI` in your shell.

4. Start the server:

```bash
npm start
```

5. Open `http://localhost:3000`

## MongoDB Migration

This project now stores app data in MongoDB.

On the first run against an empty database, the server will:

- import existing data from `data/store.json` if that file exists
- otherwise create default seed data

That means your current local records can be pushed into MongoDB just by starting the app with a valid `MONGODB_URI`.

## Deploy

You can deploy this on Render, Railway, Cyclic, or any Node host.

Set these environment variables in your hosting dashboard:

- `MONGODB_URI`
- `PORT` if your host requires it

Build/start command:

```bash
npm start
```

## MongoDB Atlas Steps

1. Create a free cluster in MongoDB Atlas.
2. Create a database user.
3. In Network Access, allow your deployment platform IPs, or use `0.0.0.0/0` while testing.
4. Copy the connection string.
5. Replace the placeholder values in `.env` or in your hosting provider environment settings.
6. Run the app once to import `data/store.json` into MongoDB.

## API

### Farmers

- `GET /api/farmers`
- `GET /api/farmers/stats`
- `POST /api/farmers`
- `PUT /api/farmers/:id`
- `DELETE /api/farmers/:id`

### Land Records

- `GET /api/land`
- `GET /api/land/:id`
- `POST /api/land`
- `PUT /api/land/:id`
- `DELETE /api/land/:id`

### Schemes

- `GET /api/schemes`
- `POST /api/schemes`
- `POST /api/schemes/:id/enroll`

### Activity and Reports

- `GET /api/activity`
- `GET /api/reports/summary`
- `GET /api/health`
=======
# Krishi-Seva
>>>>>>> 6f57b730b667632647501670d99f39feae526790
