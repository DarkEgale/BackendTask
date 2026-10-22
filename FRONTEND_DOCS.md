# Frontend Developer Documentation

## Overview
API integration guide for the frontend application built with **React (JavaScript)**.

The backend is a **Node.js + Express + Mongoose** application providing:
- User authentication (JWT access + refresh tokens, HTTP-only cookies)
- Session management (refresh, revoke, per-user session limit)
- Notes CRUD with ownership enforcement
- Admin-only user management
- User grouping by interest
- **A user-managed interest catalog** — users can browse suggestions *and* add their own
  interest by name (new names are created on the fly)

---

## Base URL

```
http://localhost:5000/api
```

### Allowed Origins (CORS)
Only these origins are allowed, with credentials enabled:

| Origin | Typical stack |
|--------|---------------|
| `http://localhost:5173` | Vite dev server |
| `http://127.0.0.1:5500` | Live Server extension |

If you run the frontend on a different port you **must** add it to the `cors` origin list
in `server.js`, otherwise the browser will block the cookies.

---

## Authentication

### How it works

| Step | Endpoint | Result |
|------|----------|--------|
| 1 | `POST /api/auth/register` | Creates the user, sets cookies |
| 2 | `POST /api/auth/login` | Verifies credentials, sets cookies |
| 3 | Any protected call | Sends the `accessToken` cookie automatically |
| 4 | On `401` | Call `POST /api/auth/refresh-session` to rotate tokens |
| 5 | On logout | Call `POST /api/auth/revoke` to kill the session |

### Cookies set on register / login

| Cookie | Lifetime | Path | Flags |
|--------|----------|------|-------|
| `accessToken` | 15 minutes | `/` | `httpOnly`, `sameSite=strict`, `secure` in production |
| `refreshToken` | 7 days | `/refresh-session` | `httpOnly`, `sameSite=strict`, `secure` in production |

> **Important:** `refreshToken` is scoped to the path `/refresh-session`, so the browser
> will **only** send it to that endpoint. Never expect to read it on other routes.

### Two ways to authenticate

**1. Cookie (recommended for browsers)**

`httpOnly` cookies are invisible to JavaScript, so you never touch the token yourself —
just make sure cookies are sent:

```javascript
// fetch
await fetch("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
  credentials: "include"
});

// axios
axios.post("/api/auth/login", { email, password }, { withCredentials: true });
```

**2. `Authorization: Bearer <token>` (for mobile / non-browser clients)**

The server checks the header **first** and falls back to the cookie:

```javascript
await fetch("/api/notes", {
  headers: { Authorization: `Bearer ${accessToken}` }
});
```

> **Note:** the token is **not** returned in the JSON body — only in the `Set-Cookie`
> header. A non-browser client must read the `accessToken` cookie value from the
> `Set-Cookie` header of the register/login response and send it as a Bearer token.

### `sameSite=strict` caveat

`sameSite=strict` means the cookie is **not** sent on cross-site requests. Same-site means
the same registrable domain — `http://localhost:5173` → `http://localhost:5000` is
same-site and works. But `https://app.example.com` → `https://api.example.com` is **also**
same-site, while `https://app.example.com` → `https://api.other.com` is **not**. For a
fully cross-site deployment, either host the API on the same site or use the Bearer
header instead.

---


## API Endpoints

### Auth Routes — `/api/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/register` | No | Register a new user |
| `POST` | `/api/auth/login` | No | Log in |
| `POST` | `/api/auth/refresh-session` | Refresh cookie | Rotate the token pair |
| `POST` | `/api/auth/revoke` | Yes | Revoke a session |

**Register request:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "interests": ["Chess", "<interestId>"]
}
```

`interests` is optional. `name`, `email` and `password` are all required. The password
must be at least 6 characters.

`interests` accepts a mixed array of **interest IDs** and **interest names**. A name that
does not exist yet is **created automatically**, so a user can add their own interest
while signing up. Names are matched case-insensitively, so `"chess"` and `"Chess"` refer
to the same interest. Maximum **20** interests per user.

> Use `GET /api/interests` to show suggestions while the user types. See
> [Interests Routes](#interests-routes).

**Register / Login response** (`201` / `200`):
```json
{
  "success": true,
  "user": {
    "_id": "665f1a2b3c4d5e6f7a8b9c0d",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "interests": [
      { "_id": "665f1a2b3c4d5e6f7a8b9c0e", "name": "Chess", "createdAt": "...", "updatedAt": "..." }
    ],
    "createdAt": "2024-06-01T10:00:00.000Z",
    "updatedAt": "2024-06-01T10:00:00.000Z"
  },
  "ssid": "9f8e7d6c5b4a39281706f5e4d3c2b1a0"
}
```

> On **register** and **login** the `interests` array is **populated** with the full
> interest objects (including `name`), so the UI can render the chips immediately.

The `password` hash is **never** included in any response.

**Refresh-session response** (`200`):
```json
{ "success": true, "ssid": "9f8e7d6c5b4a39281706f5e4d3c2b1a0" }
```

**Revoke request:**
```json
{ "ssid": "9f8e7d6c5b4a39281706f5e4d3c2b1a0" }
```

You may only revoke **your own** session; an admin may revoke anyone's. Revoking your own
session also clears the cookies.

---


### User Routes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `PUT` | `/api/users/password` | Any user | Change own password |
| `GET` | `/api/users` | **Admin** | Get all users (paginated) |
| `GET` | `/api/users/:userId` | **Admin** | Get a single user |
| `PUT` | `/api/users/:userId` | **Admin** | Update a user |
| `DELETE` | `/api/users/:userId` | **Admin** | Delete a user |
| `GET` | `/api/users/grouped/interest` | Any user | Users grouped by interest |
| `GET` | `/api/users/:userId/posts` | Own or **Admin** | Get a user's posts |
| `GET` | `/api/users/me/interests` | Any user | **Get my own interests** |
| `POST` | `/api/users/me/interests` | Any user | **Add an interest to my profile** |
| `PUT` | `/api/users/me/interests/:interestId` | Any user | **Rename one of my interests** |
| `DELETE` | `/api/users/me/interests/:interestId` | Any user | **Remove one of my interests** |

**Change own password:**
```json
{ "oldPassword": "password123", "newPassword": "newpassword123" }
```

Returns `200` with the updated `user`. The old password must be correct, otherwise `401`.
The new password must be at least 6 characters, otherwise `400`.

**Get all users** — `GET /api/users?page=1&limit=10`:
```json
{
  "success": true,
  "users": [
    {
      "_id": "665f1a2b3c4d5e6f7a8b9c0d",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "user",
      "interests": []
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalItems": 25,
    "itemsPerPage": 10
  }
}
```

> `GET /api/users` is **admin-only**. A non-admin receives `403`.

**Update user** (admin) — body fields are all optional:
```json
{ "name": "New Name", "email": "new@example.com", "role": "admin", "interests": [] }
```

The `interests` field accepts the same mixed array of IDs and names as registration —
unknown names are created, unknown IDs return `404`.

**Manage my own interests** — any logged-in user can add and remove their own interests.

*Add an interest* — `POST /api/users/me/interests`:
```json
{ "name": "Chess" }
```
or, to add an existing interest by ID:
```json
{ "interestId": "665f1a2b3c4d5e6f7a8b9c0e" }
```

Response (`201`):
```json
{
  "success": true,
  "message": "Interest added successfully",
  "interest": {
    "_id": "665f1a2b3c4d5e6f7a8b9c0e",
    "name": "Chess",
    "createdAt": "2024-06-01T10:00:00.000Z",
    "updatedAt": "2024-06-01T10:00:00.000Z"
  },
  "user": { "...": "the updated user document" }
}
```

*List my interests* — `GET /api/users/me/interests`:
```json
{
  "success": true,
  "count": 2,
  "interests": [
    { "_id": "665f1a2b3c4d5e6f7a8b9c0e", "name": "Chess", "createdAt": "...", "updatedAt": "..." }
  ]
}
```

*Remove an interest* — `DELETE /api/users/me/interests/:interestId` → `200` with the
updated `user`.

*Rename an interest* — `PUT /api/users/me/interests/:interestId`:
```json
{ "name": "Board Games" }
```

Response (`200`):
```json
{
  "success": true,
  "message": "Interest updated successfully",
  "interest": { "_id": "665f1a2b3c4d5e6f7a8b9c0e", "name": "Board Games", "createdAt": "...", "updatedAt": "..." },
  "user": { "...": "the updated user document" }
}
```

The name is trimmed and whitespace-collapsed, must be 1–50 characters (`400`
otherwise), and must not already be in use by another interest (`409`).

> **Important:** interests live in a *shared* catalog. Renaming an interest that
> other users also have would change their profile too, so a personal rename is
> **isolated to the caller**:
> - if you are the only user with that interest → it is renamed in place;
> - if others share it → you are moved onto a separate interest carrying the new
>   name, and the shared one is left untouched for them.
>
> The `interest._id` in the response may therefore differ from the one in the
> request URL. Always re-render from the returned `interests` list.

> You can only manage **your own** interests — there is no route to edit another
> user's profile interests (that is admin-only via `PUT /api/users/:userId`).

**Get users grouped by interest** — `GET /api/users/grouped/interest?page=1&limit=10`:
```json
{
  "success": true,
  "count": 2,
  "users": [
    {
      "interest": "665f1a2b3c4d5e6f7a8b9c0e",
      "name": "Chess",
      "users": [
        { "_id": "665f1a2b3c4d5e6f7a8b9c0d", "name": "Alice", "email": "alice@example.com", "role": "user" }
      ]
    }
  ]
}
```

> `interest` is the **interest ID** (an ObjectId); `name` is the human readable
> interest name.

**Get a user's posts** — `GET /api/users/:userId/posts?page=1&limit=10`:
```json
{
  "success": true,
  "count": 1,
  "posts": [
    {
      "userId": "665f1a2b3c4d5e6f7a8b9c0d",
      "name": "John Doe",
      "email": "john@example.com",
      "post": {
        "_id": "665f1a2b3c4d5e6f7a8b9c0f",
        "title": "My Post",
        "content": "Post content here",
        "status": "published",
        "createdAt": "2024-06-01T10:00:00.000Z",
        "updatedAt": "2024-06-01T10:00:00.000Z"
      }
    }
  ]
}
```

> Each entry wraps the post in a nested `post` object alongside the owner's `userId`,
> `name` and `email`.

---

### Interests Routes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/interests` | No | **List the interest catalog** (public) |
| `GET` | `/api/interests/:interestId` | Any user | Get a single interest |
| `PUT` | `/api/interests/:interestId` | **Admin** | **Rename a catalog interest** |
| `GET` | `/api/users/me/interests` | Any user | **List my own interests** |
| `POST` | `/api/users/me/interests` | Any user | **Add an interest (by name or id)** |
| `PUT` | `/api/users/me/interests/:interestId` | Any user | **Rename one of my interests** |
| `DELETE` | `/api/users/me/interests/:interestId` | Any user | **Remove one of my interests** |

**List the catalog** — `GET /api/interests?page=1&limit=20&search=ch`:
```json
{
  "success": true,
  "interests": [
    {
      "_id": "665f1a2b3c4d5e6f7a8b9c0e",
      "name": "Chess",
      "createdAt": "2024-06-01T10:00:00.000Z",
      "updatedAt": "2024-06-01T10:00:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 1,
    "totalItems": 1,
    "itemsPerPage": 20
  }
}
```

This endpoint is **public** (no token needed) so a sign-up form can show suggestions
before the user is logged in. `search` does a case-insensitive partial match on the name.

**Add an interest** — `POST /api/users/me/interests`:
```json
{ "name": "Rock climbing" }
```

If the name does not exist yet it is **created**; if it already exists (case-insensitive)
the existing one is attached. Responds `201` with the `interest` and the updated `user`.

**Get a single interest** — `GET /api/interests/:interestId` → `200` with the `interest`
object.

**Remove an interest** — `DELETE /api/users/me/interests/:interestId` → `200` with the
updated `user`.

**Rename my interest** — `PUT /api/users/me/interests/:interestId` with
`{ "name": "..." }` → `200` with the `interest` and the updated `user`. The rename is
**isolated to the caller** (see the Users section for the full explanation).

**Rename a catalog interest (admin)** — `PUT /api/interests/:interestId` with
`{ "name": "..." }` → `200` with the `interest`. This edits the **shared** catalog
entry, so the new name is shown to every user that has that interest.

> **Rules:** max **20** interests per user, names max **50** characters, adding one you
> already have returns `409`, removing one you do not have returns `404`, renaming one
> you do not have returns `404`, renaming onto an existing name returns `409`.

---

### Notes Routes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/notes` | `user` or `admin` | List notes (paginated) |
| `GET` | `/api/notes/:noteId` | `user` or `admin` | Get a single note |
| `POST` | `/api/notes` | `user` or `admin` | Create a note |
| `PUT` | `/api/notes/:noteId` | Owner or `admin` | Update a note |
| `DELETE` | `/api/notes/:noteId` | Owner or `admin` | Delete a note |

> The update verb is **`PUT`**, not `PATCH`.

**Create note request:**
```json
{
  "title": "My Note",
  "notes": "Note content here"
}
```

You do **not** send `userId` — it is taken from the access token. The note is created with
`status: "active"`.

**Create note response** (`201`):
```json
{
  "success": true,
  "message": "Note created successfully",
  "note": {
    "_id": "665f1a2b3c4d5e6f7a8b9c0f",
    "userId": "665f1a2b3c4d5e6f7a8b9c0d",
    "title": "My Note",
    "notes": "Note content here",
    "status": "active",
    "createdAt": "2024-06-01T10:00:00.000Z",
    "updatedAt": "2024-06-01T10:00:00.000Z"
  }
}
```

**List notes** — `GET /api/notes?page=1&limit=10`:
```json
{
  "success": true,
  "notes": [
    {
      "_id": "665f1a2b3c4d5e6f7a8b9c0f",
      "title": "My Note",
      "notes": "Note content here",
      "status": "active",
      "createdAt": "2024-06-01T10:00:00.000Z",
      "updatedAt": "2024-06-01T10:00:00.000Z",
      "user": {
        "_id": "665f1a2b3c4d5e6f7a8b9c0d",
        "name": "John Doe",
        "email": "john@example.com",
        "role": "user"
      }
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalItems": 25,
    "itemsPerPage": 10
  }
}
```

> A regular user sees **only their own** notes. An admin sees **all** notes.

**Get single note** (`200`) — same shape as the `note` object above.

**Update note** — `PUT /api/notes/:noteId`, body fields optional:
```json
{ "title": "Updated title", "notes": "Updated content", "status": "archived" }
```

`status` must be one of `active`, `archived`, `deleted`. Returns `200` with the updated

---

## Response Formats

### Success envelope
There is **no single envelope** — each endpoint returns its own keys. The common ones:

| Endpoint | Keys |
|----------|------|
| register / login | `success`, `user`, `ssid` |
| refresh-session | `success`, `ssid` |
| revoke / delete note | `success`, `message` |
| list notes | `success`, `notes`, `pagination` |
| single note / create / update note | `success`, `note` (+ `message` on create/update) |
| list users | `success`, `users`, `pagination` |
| single user / update user | `success`, `user` (+ `message` on update) |
| grouped by interest | `success`, `count`, `users` |
| user posts | `success`, `count`, `posts` |
| update password | `success`, `user`, `message` |
| **list interest catalog** | `success`, `interests`, `pagination` |
| **single interest** | `success`, `interest` |
| **my interests** | `success`, `count`, `interests` |
| **add interest** | `success`, `message`, `interest`, `user` |
| **remove interest** | `success`, `message`, `user` |

### Pagination object
```json
{
  "currentPage": 1,
  "totalPages": 3,
  "totalItems": 25,
  "itemsPerPage": 10
}
```

`page` defaults to `1`, `limit` defaults to `10`.

### Error envelope
All errors are JSON:
```json
{
  "success": false,
  "message": "Human readable message"
}
```

### Status codes

| Code | Meaning | When |
|------|---------|------|
| `200` | OK | Successful request |
| `201` | Created | Note / user / **interest** created |
| `400` | Bad Request | Validation error, invalid ObjectId, missing field, malformed JSON |
| `401` | Unauthorized | Missing / invalid / expired token, wrong password, revoked session |
| `403` | Forbidden | Wrong role, not the owner of the resource |
| `404` | Not Found | Unknown route, or a resource that doesn't exist / isn't yours |
| `409` | Conflict | Email already registered, **interest already added** |
| `429` | Too Many Requests | Rate limit hit (too many failed logins) |
| `500` | Internal Server Error | Unexpected server fault (details are never leaked) |

### Common errors you may receive

| Message | Status | Cause |
|---------|--------|-------|
| `"email is already in use"` | `409` | Email already registered |
| `"Please provide a valid email"` | `400` | Malformed email |
| `"Password must be at least 6 characters long"` | `400` | Password too short |
| `"Invalid email or password"` | `401` | Wrong credentials on login |
| `"User not found with this email"` | `404` | No account for that email |
| `"No token provided"` | `401` | Request sent without a token |
| `"Session invalid or revoked"` | `401` | Session was revoked or expired |
| `"Token reuse detected. Session revoked."` | `401` | Old refresh token replayed |
| `"You do not have permission to perform this action"` | `403` | Role check failed |
| `"You can only revoke your own session"` | `403` | Tried to revoke someone else's session |
| `"Note not found"` | `404` | Note missing **or** owned by someone else |
| `"Interest already added"` | `409` | The interest is already on your profile |
| `"Interest not found on your profile"` | `404` | Removing an interest you do not have |
| `"You can select at most 20 interests"` | `400` | Interest limit exceeded |
| `"Invalid noteId"` | `400` | Malformed id in the URL |
| `"Too many failed login attempts, please try again later"` | `429` | Rate limit hit |

> The `message` field is for humans — don't branch on its exact text. Branch on the
> **status code** instead.

---

## Rate limits

| Endpoint | Limit | Window | Notes |
|----------|-------|--------|-------|
| `POST /api/auth/login` | 10 **failed** attempts | 15 min | Successful logins do not count |
| `POST /api/auth/register` | 10 | 1 hour | **Only enforced in production** |

A rate-limited request returns `429` with a JSON body. Show a "try again later" message
rather than retrying immediately.

---

## Session limits

A user may hold at most **5 concurrent sessions**. When a 6th is created, the oldest one
is deleted automatically and its access token stops working (subsequent calls return
`401`). This means:

- A user logged in on 6 devices will be silently logged out of the oldest one.
- Do not assume a previously valid token stays valid forever — handle `401` by
  refreshing, and if that fails, redirect to login.

---

## React Integration Examples

### API client with automatic refresh (fetch)

```javascript
const BASE_URL = "http://localhost:5000/api";

const apiFetch = async (path, options = {}, isRetry = false) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    },
    ...options
  });

  // Access token expired -> rotate it once, then retry the original request
  if (response.status === 401 && !isRetry && !path.startsWith("/auth/refresh-session")) {
    const refresh = await fetch(`${BASE_URL}/auth/refresh-session`, {
      method: "POST",
      credentials: "include"
    });

    if (refresh.ok) {
      return apiFetch(path, options, true);
    }

    // Refresh failed -> session is gone
    window.location.href = "/login";
    return null;
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Something went wrong");
  }

  return data;
};

// Usage
const notes = await apiFetch("/notes?page=1&limit=10");
console.log(notes.notes, notes.pagination);
```

### Axios instance with an interceptor

```javascript
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5000/api",
  withCredentials: true
});

let isRefreshing = false;
let queue = [];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;

    if (response?.status === 401 && !config._retried) {
      config._retried = true;

      if (!isRefreshing) {
        isRefreshing = true;
        try {
          await axios.post(
            "http://localhost:5000/api/auth/refresh-session",
            {},
            { withCredentials: true }
          );
          const pending = queue;
          queue = [];
          pending.forEach(cb => cb());
        } catch {
          window.location.href = "/login";
        } finally {
          isRefreshing = false;
        }
      }

      return new Promise((resolve, reject) => {
        queue.push(() => api(config).then(resolve).catch(reject));
      });
    }

    return Promise.reject(error);
  }
);
```

### Login / logout component

```jsx
import { useState } from "react";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const res = await fetch("http://localhost:5000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include"
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message);
        return;
      }

      // data.user holds the profile; the password hash is never sent
      console.log("Logged in as", data.user.name, "role:", data.user.role);
    } catch (err) {
      setError("Network error. Is the backend running?");
    }
  };

  return (
    <form onSubmit={handleLogin}>
      <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="Password"
      />
      {error && <p className="error">{error}</p>}
      <button type="submit">Login</button>
    </form>
  );
};
```

**Logout** (revoke the session, then clear client state):

```javascript
const logout = async () => {
  await fetch("http://localhost:5000/api/auth/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ssid }),
    credentials: "include"
  });

  // The server also clears the cookies
};
```

> If you did not keep the `ssid` from the login response, you can still call
> `/api/auth/revoke` — but you need a valid `ssid` in the body, so store it in React
> state when the user logs in.

### Interest picker (user adds their own)

```jsx
import { useEffect, useState } from "react";

const BASE_URL = "http://localhost:5000/api";

const InterestPicker = () => {
  const [suggestions, setSuggestions] = useState([]);
  const [mine, setMine] = useState([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  // Load the catalog (public) and my current interests
  useEffect(() => {
    const load = async () => {
      const [catalog, myRes] = await Promise.all([
        fetch(`${BASE_URL}/interests?limit=50`, { credentials: "include" }).then(r => r.json()),
        fetch(`${BASE_URL}/users/me/interests`, { credentials: "include" }).then(r => r.json())
      ]);

      setSuggestions(catalog.interests || []);
      setMine(myRes.interests || []);
    };

    load();
  }, []);

  // Filter the suggestions as the user types
  const filtered = suggestions.filter(i =>
    i.name.toLowerCase().includes(input.trim().toLowerCase())
  );

  const addInterest = async (name) => {
    setError("");

    const res = await fetch(`${BASE_URL}/users/me/interests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
      credentials: "include"
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.message);
      return;
    }

    // The server created it if it was new — just take what it returned
    setMine(prev => [...prev, data.interest]);
    setInput("");
  };

  const removeInterest = async (interestId) => {
    const res = await fetch(`${BASE_URL}/users/me/interests/${interestId}`, {
      method: "DELETE",
      credentials: "include"
    });

    if (res.ok) {
      setMine(prev => prev.filter(i => i._id !== interestId));
    }
  };

  return (
    <div>
      <h3>My interests</h3>
      <ul>
        {mine.map(i => (
          <li key={i._id}>
            {i.name}
            <button onClick={() => removeInterest(i._id)}>Remove</button>
          </li>
        ))}
      </ul>

      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="Add an interest..."
      />

      <ul>
        {filtered.map(i => (
          <li key={i._id}>
            <button onClick={() => addInterest(i.name)}>{i.name}</button>
          </li>
        ))}
      </ul>

      {/* The user can type a brand new interest that is not in the list */}
      {input.trim() && !filtered.some(i => i.name.toLowerCase() === input.trim().toLowerCase()) && (
        <button onClick={() => addInterest(input.trim())}>
          Create & add "{input.trim()}"
        </button>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
};
```

> The catalog is only a **suggestion list**. Typing a name that is not in it creates a new
> interest on the server, so a user is never blocked from adding their own.

### Role-based UI

The `role` field on the user object is `"user"` or `"admin"`. Use it to hide UI that the
API would reject anyway:

```jsx
const AdminPanel = ({ user }) => {
  if (user?.role !== "admin") return null;
  return <button>Manage users</button>;
};
```

> Hiding the UI is a UX convenience only — the API enforces the rule independently, so a
> user who calls `GET /api/users` directly still gets `403`.

---


---

## Security notes for the frontend

1. **Never store the tokens in `localStorage`.** They are `httpOnly` cookies, which is
   deliberate — it prevents XSS from reading them.
2. **Never read the cookie from JavaScript.** You cannot, and you should not try.
   Send requests with `credentials: "include"` (or `withCredentials: true` in axios).
3. **Always call `response.json()`** — every response, including errors, is JSON. There
   is no HTML error page.
4. **Handle `401` centrally** with an axios interceptor or a fetch wrapper that retries
   once via `/api/auth/refresh-session` before logging the user out.
5. **Do not assume a `404` means the resource is missing.** For notes it can also mean
   "it belongs to someone else".

---

`note`.

**Delete note** — `DELETE /api/notes/:noteId`:
```json
{ "success": true, "message": "Note deleted successfully" }
```

### Notes ownership rules

| Caller | Own note | Someone else's note |
|--------|----------|---------------------|
| `user` | ✅ allowed | ❌ `404` |
| `admin` | ✅ allowed | ✅ allowed |

> A `404` (not `403`) is returned for another user's note so that the endpoint does not
> leak whether the note exists. In the UI, show "Note not found" for `404`.

---

      "post": {
        "_id": "665f1a2b3c4d5e6f7a8b9c0f",
        "title": "My Post",
        "content": "Post content",
        "status": "published",
        "createdAt": "2024-06-01T10:00:00.000Z",
        "updatedAt": "2024-06-01T10:00:00.000Z"
      }
    }
  ]
}
```

> Note the shape: each entry wraps a single `post` object. A user may only read their own
> posts — anyone else gets `403`.

---
