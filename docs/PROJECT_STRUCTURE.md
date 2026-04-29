# Project Structure

This project is now grouped so the frontend, backend, data, and docs each have a clear home.

## Main folders

`src/server/`
- Backend Express + MongoDB code.
- `index.js`: main API server, database connection, auth flow, seed logic, and routes.

`public/`
- Browser files served by Express.
- `index.html`: login/signup screen plus the single-page dashboard shell.
- `css/styles.css`: all frontend styling, including auth UI.
- `js/api.js`: API wrapper used by the UI, including auth token handling.
- `js/app.js`: main UI logic, auth state, and page interactions.
- `js/data.js`: placeholder fallback seed hook for the frontend.

`data/`
- Local JSON seed data.
- `store.json`: imported into MongoDB when the database starts empty.

`docs/`
- Project notes for humans.
- `PROJECT_STRUCTURE.md`: quick navigation guide.

## Root files

`server.js`
- Small entry file that starts `src/server/index.js`.

`package.json`
- Dependencies and npm scripts.

`README.md`
- Setup, run instructions, and a short file map.

`render.yaml`
- Deployment config for Render.

`.env.example`
- Environment variable template.

`krishiseva.db`
- Old local database artifact. It is not part of the current MongoDB flow.

## Quick reading order

1. Start with `README.md`
2. Then read `public/index.html`
3. Then `public/js/app.js`
4. Then `public/js/api.js`
5. Then `src/server/index.js`
