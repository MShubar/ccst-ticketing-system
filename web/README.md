# CCST Ticketing — React frontend

Vite + React + TypeScript app based on [MShubar/React-Template](https://github.com/MShubar/React-Template).

The classic UI in `../frontend/` stays in place until you approve a cutover. Express still serves that folder in production.

## Structure (same as the template)

```
src/
  api/           axios client + interceptors + query keys
  components/    common + ui
  config/        env
  constants/     routes
  layouts/       Auth / Main / Admin / Empty
  pages/         Login, Dashboard, Tickets, Map, …
  providers/     AppProvider (Query + auth bootstrap + toasts)
  routes/        router, ProtectedRoute, RoleRoute
  services/      mutations + queries
  store/         zustand auth store
  types/
  utils/
```

## Run

From the repo root (backend must be on port 3847):

```bash
npm start          # classic API + classic frontend on :3847
npm run web:dev    # React app on :5173 (proxies /api → :3847)
```

Or inside this folder:

```bash
npm install
npm run dev
```

Sign in with the same accounts as the classic app (`instructor` / `ProCloud-G18`).

## Notes

- Auth uses **HTTP-only cookies** (`withCredentials`), not Bearer tokens.
- Lab map / hardware are still classic-only; Map page links to `http://localhost:3847/#/map`.
- When you approve cutover we will point Express at `web/dist` and retire `frontend/`.
