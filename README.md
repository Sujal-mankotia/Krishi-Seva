# KrishiSeva

KrishiSeva is a full-stack agricultural data management system for registering farmers, maintaining land records, tracking scheme enrollment, and viewing district-level reports through a single web dashboard.

## Highlights

- Farmer registration with personal, land, banking, and document details
- Land parcel management linked to farmer records
- Scheme creation and beneficiary enrollment tracking
- Dashboard analytics for farmers, land, schemes, and activity
- Role-aware access with admin, sub-admin, and user scopes
- Signup whitelist management for controlled account creation
- Custom bearer-token authentication with hashed passwords
- MongoDB-backed storage with seed import for empty databases

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js, Express
- Database: MongoDB with Mongoose
- Validation: `express-validator`
- Security utilities: Node.js `crypto`

## Project Structure

```text
krishiseva/
|-- data/
|   |-- store.json
|   `-- whitelist.json
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
|-- scripts/
|   `-- smoke-test.js
|-- src/
|   `-- server/
|       `-- index.js
|-- .env.example
|-- package.json
|-- render.yaml
`-- server.js
```

## What Lives Where

- `public/index.html`: dashboard layout, forms, tabs, and modal markup
- `public/css/styles.css`: all styling for auth, dashboard, forms, cards, and reports
- `public/js/app.js`: UI logic, form submission, rendering, filters, reports, and page flow
- `public/js/api.js`: frontend API client and bearer-token handling
- `src/server/index.js`: Express app setup, auth, validation, MongoDB models, and API routes
- `server.js`: thin server entrypoint that starts the app
- `data/store.json`: seed data imported when the database is empty
- `data/whitelist.json`: approved signup emails and scoped access rules
- `scripts/smoke-test.js`: basic end-to-end smoke test for core flows

## Core Modules

- Authentication: register, login, session restore, logout
- Admin access control: whitelist read, add/update, remove
- Farmers: create, read, update, delete, and scoped filtering
- Land records: create, read, update, delete, and farmer linking
- Schemes: listing, creation, and farmer enrollment
- Reports: summary analytics and recent activity

## Authentication and Security

KrishiSeva uses custom bearer-token authentication.

- Passwords are salted and hashed with `crypto.scryptSync()`
- Tokens are signed with HMAC SHA-256 using `AUTH_SECRET`
- Tokens are stored on the client in `localStorage`
- Protected API routes are guarded by custom middleware
- Admin-only routes use a separate authorization check

## API Overview

Main route groups exposed by the backend:

- `/api/auth`: register, login, session, logout
- `/api/admin/whitelist`: whitelist and scoped access management
- `/api/farmers`: farmer records and farmer statistics
- `/api/land`: land record management
- `/api/schemes`: scheme listing, creation, and enrollments
- `/api/activity`: recent activity feed
- `/api/reports/summary`: reporting summary
- `/api/health`: application and database health check

## Environment Variables

Create a `.env` file in the project root. Typical variables used by the app:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/krishiseva
AUTH_SECRET=replace-with-a-secure-secret
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-me
ADMIN_NAME=Admin
PORT=3000
```

Notes:

- If `MONGODB_URI` is not set, the app falls back to a local MongoDB URL
- If the database is empty, seed data from `data/store.json` is imported on first run
- `ADMIN_PASSWORD` should be set before using the app in a shared or deployed environment

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from the example or manually add the required values.

On Windows:

```bash
copy .env.example .env
```

3. Update `.env` with your MongoDB connection string and admin credentials.

4. Start the app:

```bash
npm start
```

5. Open:

```text
http://localhost:3000
```

## Testing

Run the smoke test:

```bash
npm test
```

The smoke test checks:

- health endpoint availability
- auth register and session flow
- protected route behavior
- farmer create, update, and delete
- linked land record behavior
- reports and activity responses

## Deployment

This repository includes a `render.yaml` for Render deployment.

- Runtime: Node
- Start command: `npm start`
- Build command: `npm install`
- Required environment variable: `MONGODB_URI`

You should also configure:

- `AUTH_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_NAME`

## Developer Notes

- `server.js` is only the startup wrapper; most backend logic lives in `src/server/index.js`
- The frontend is a static app served directly by Express
- The app currently uses MongoDB; the legacy `krishiseva.db` file is not part of the active flow
- Route protection is scope-aware, so sub-admins can be limited to specific states and districts

## Future Improvements

- Add stronger frontend form validation for farmer and land forms
- Move custom token logic to a standard auth library if interoperability is needed
- Split the server into route, controller, service, and model layers
- Add unit and integration tests beyond the current smoke test
- Add API documentation with request and response examples
