# KrishiSeva

KrishiSeva is a full-stack web application for managing farmer registrations, land records, scheme enrollments, and district-level analytics.

## Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- Database: MongoDB

## Folder map

```text
krishiseva/
|-- data/
|   `-- store.json
|-- docs/
|   `-- PROJECT_STRUCTURE.md
|-- public/
|   |-- css/
|   |   `-- styles.css
|   |-- js/
|   |   |-- api.js
|   |   |-- app.js
|   |   `-- data.js
|   `-- index.html
|-- src/
|   `-- server/
|       `-- index.js
|-- .env.example
|-- package.json
|-- render.yaml
`-- server.js
```

## What lives where

- `public/index.html`: page structure and section layout
- `public/css/styles.css`: full UI styling
- `public/js/app.js`: page behavior, rendering, forms, tables, reports
- `public/js/api.js`: API calls to the backend
- `src/server/index.js`: Express server, MongoDB setup, seed loading, API routes
- `data/store.json`: startup seed data for empty databases

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from the example:

```bash
copy .env.example .env
```

3. Set `MONGODB_URI` in `.env`.

4. Start the app:

```bash
npm start
```

5. Open `http://localhost:3000`

## Notes

- If MongoDB is empty, the app imports `data/store.json` on first run.
- `server.js` is only a thin entrypoint. Most backend work is in `src/server/index.js`.
- The old `krishiseva.db` file is still in the repo, but the current app flow uses MongoDB.
