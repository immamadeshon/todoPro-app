# TodoPro App

A Persian (RTL) to-do list built with **Knockout.js** (MVVM), vanilla JavaScript and a small dependency-free **Node.js** server.

🔗 **Live demo (GitHub Pages):** https://immamadeshon.github.io/todoPro-app/

> The live demo is a static site, so it runs in **guest mode**: your tasks are saved in your browser (`localStorage`).
> Accounts and server sync need the Node server (see [Run locally](#run-locally)).

## Features

- Add, edit, complete, delete and filter tasks (all / active / completed), copy a task with a double click
- **Works for everyone**
  - **Guests (anonymous):** no sign-in needed; tasks are saved in the browser
  - **Signed-in users:** their own list, separate from guests and from other users on the same browser
- **Sign up / Sign in** pages with live validation
- **Upload / Download:** save your list on the server and restore it on any device
- Token-based authentication (JWT) – the `Authorization` header is added to **every** API request by one wrapper (`Auth.fetch`), and the server protects every `/api/*` route by default
- Passwords are stored only as `scrypt` hashes with a per-user salt

## How the state is stored (per user)

| Who | Where | Key / file |
| --- | --- | --- |
| Guest | browser `localStorage` | `todo-app-state-v1:anonymous` |
| Signed-in user | browser `localStorage` | `todo-app-state-v1:<userId>` |
| Signed-in user (after *Upload*) | server | `data/states/<userId>.json` |

## Run locally

Requires Node.js 16+ (no packages to install).

```bash
node server.js
# open http://localhost:3000
```

The server serves the pages and the API (`/api/auth/signup`, `/api/auth/signin`, `/api/auth/me`, `/api/state`).
User data is written to the `data/` folder, which is **git-ignored** (it contains the token signing key).

## Configuration

Everything deployment-related is in [`js/config.js`](js/config.js):

| Option | Meaning |
| --- | --- |
| `API_BASE` | URL of the backend. `''` = same server (default). Set it to e.g. `https://your-api.example.com` if the server is hosted elsewhere. |
| `SERVER_ENABLED` | Set `false` to hide sign in / sign up / sync and run as guest-only. On `*.github.io` with an empty `API_BASE` this is automatic. |

## Deploy to GitHub Pages

1. Push the project to GitHub (branch `master`).
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch**, choose `master` and `/ (root)`, then **Save**.
3. After about a minute the site is live at `https://<username>.github.io/<repo>/`.

All paths in the project are relative, so it works under the `/<repo>/` sub-path. The `.nojekyll` file turns off Jekyll processing.

To enable accounts on the Pages version, host `server.js` on any Node host (Render, Railway, ...), then set `API_BASE` in `js/config.js` to that URL.

## Project structure

```
index.html          main page (works as guest or signed-in)
signin.html         sign in page
signup.html         sign up page
server.js           Node server: static files + auth + per-user state API
css/                styles
js/app.js           Knockout view model for the todo list
js/auth.js          session, Auth.fetch (adds the token to every request), guards
js/signin.js        view model of the sign in page
js/signup.js        view model of the sign up page
js/config.js        deployment settings
```

## Security notes

This is a learning project. The token is kept in `localStorage` (an `HttpOnly` cookie is safer against XSS), "sign out" only removes the token on the client, and in production the app must be served over HTTPS.
