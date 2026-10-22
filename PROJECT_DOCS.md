# Backend Task Project Documentation

## Project Overview

This is a Node.js + Express + Mongoose backend application built with ES Modules (`"type": "module"`). It provides user authentication, notes management, user CRUD, and interest-based user grouping using MongoDB aggregation pipelines.

**Tech Stack:**
- Node.js (ES Modules)
- Express.js
- Mongoose (MongoDB ODM)
- jsonwebtoken (JWT)
- bcryptjs (Password hashing)
- cookie-parser (HTTP-only cookies)
- cors (Cross-Origin Resource Sharing)
- dotenv (Environment variables)

---

## Folder Structure

```
backendTask/
├── config/
│   └── db.js                 # MongoDB connection
├── controllers/
│   ├── auth.controller.js    # Auth logic (register, login, refresh, revoke)
│   ├── interests.controller.js # Interest catalog & user interest management
│   ├── notes.controller.js   # Notes CRUD logic
│   └── users.controller.js   # User CRUD & interest grouping logic
├── helpers/
│   ├── AppError.js           # Custom error class extending Error
│   └── tokenHelper.js        # JWT access & refresh token helpers
├── middlewares/
│   └── authMiddleware.js     # authenticate(...roles) middleware
├── models/
│   ├── access.model.js       # Access token & session storage
│   ├── interest.model.js     # Interest collection (separate from users)
│   ├── notes.model.js        # Notes collection
│   ├── post.model.js         # Post collection (user's posts)
│   └── user.model.js         # Users collection (with password hashing)
├── routes/
│   ├── authRoute.js          # Authentication routes
│   ├── interestRoute.js      # Interest catalog routes
│   ├── noteRoute.js          # Notes routes
│   ├── postRoute.js          # Post routes (user's posts)
│   └── userRoute.js          # User routes
├── services/
│   ├── auth.service.js       # Registration & login business logic
│   ├── interest.service.js   # Interest catalog & user interest logic
│   ├── notes.service.js      # Notes business logic (aggregation + pagination)
│   └── users.service.js      # User business logic (aggregation + pagination)
├── tests/
│   └── e2e.test.js           # End-to-end API test suite
├── .env                      # Environment variables
├── package.json              # Dependencies & scripts
├── server.js                 # Express app entry point
└── PROJECT_DOCS.md           # This file
```

## Environment Variables (`.env`)

```env
MONGODB_URI=mongodb://localhost:27017/NotesMan
JWT_ACCESS_SECRET=your_access_secret_key
JWT_REFRESH_SECRET=your_refresh_secret_key
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
NODE_ENV=development
PORT=5000
```

---

## Models

### 1. `user.model.js` — Users Collection

**Schema Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | String | Yes | User's full name |
| `email` | String | Yes (unique) | User's email address |
| `password` | String | Yes | Hashed password (bcrypt) |
| `role` | String | No | `"user"` or `"admin"` (default: `"user"`) |
| `interests` | [ObjectId] | No | References to `Interest` collection |
| `createdAt`, `updatedAt` | Date | No | Auto timestamps |

**Instance Methods:**
- `comparePassword(candidatePassword)` — compares plain password with hashed password

**Middleware:**
- `pre('save')` — automatically hashes password with bcrypt (10 salt rounds) when modified

**Indexes:**
- `{ email: 1 }` (unique) — fast email lookup, enforces uniqueness
- `{ role: 1 }` — fast role-based queries
- `{ interests: 1 }` — fast interest-based filtering

---

### 3. `post.model.js` — Posts Collection

**Schema Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | ObjectId | Yes | Reference to `Users` |
| `title` | String | Yes | Post title |
| `content` | String | Yes | Post content |
| `status` | String | No | `"published"`, `"draft"`, `"archived"` (default: `"published"`) |
| `createdAt`, `updatedAt` | Date | No | Auto timestamps |

**Indexes:**
- `{ userId: 1, createdAt: -1 }` — fast user post lookup sorted by date
- `{ title: 'text', content: 'text' }` — full-text search on title and content

---

---

### 2. `interest.model.js` — Interests Collection (Separate Collection)

**Schema Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | String | Yes (unique) | Interest name (e.g., "music", "sports") |
| `createdAt`, `updatedAt` | Date | No | Auto timestamps |

*Note: Interests are stored in a separate collection, referenced by ObjectId in the User schema.*

---

### 3. `notes.model.js` — Notes Collection

**Schema Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | ObjectId | Yes | Reference to `Users` |
| `title` | String | Yes | Note title |
| `notes` | String | Yes | Note content |

**Indexes:**
- `{ title: 'text', notes: 'text', userId: 1 }` — text search on title/notes, user-based queries

---
| `status` | String | No | `"active"`, `"archived"`, `"deleted"` (default: `"active"`) |

---

## Helpers

### 1. `helpers/AppError.js`

**Class:** `AppError extends Error`

**Constructor:** `AppError(message, status)`

| Property | Description |
|----------|-------------|
| `message` | Error message |
| `status` | HTTP status code |
| `isOperational` | `true` (flag for operational errors) |

Used for throwing structured errors with HTTP status codes (e.g., 400, 401, 403, 404).

---

### 2. `helpers/tokenHelper.js`

**Functions:**

| Function | Parameters | Description |
|----------|------------|-------------|
| `generateAccessToken(payload)` | `payload` object | Signs JWT access token (default expiry: 15m) |
| `generateRefreshToken(payload)` | `payload` object | Signs JWT refresh token (default expiry: 7d) |
| `verifyAccessToken(token)` | `token` string | Verifies access token signature; throws `AppError` (401) on failure |
| `verifyRefreshToken(token)` | `token` string | Verifies refresh token signature; throws `AppError` (401) on failure |

Both tokens carry `userId` and `ssid` in their payload.

---

## Middlewares (`middlewares/authMiddleware.js`)

### `authenticate(...roles)`
**Purpose:** Verify the JWT access token and (optionally) enforce role-based access control.

**Usage:** `authenticate()` or `authenticate("admin")` or `authenticate("user", "admin")`

**Workflow:**
1. Extract the token from the `Authorization: Bearer <token>` header, falling back to the `accessToken` cookie
2. **Step 1:** Verify JWT signature using `jwt.verify()`
3. **Step 2:** Check token validity in `Access` collection (match `ssid`, `userId`, `isRevoked: false`)
4. **Step 3:** Compare presented token hash with stored `accessToken` hash
5. Fetch user from `Users` collection
6. Attach `req.user` and `req.ssid`
7. If roles were supplied, check `req.user.role` is included — otherwise throw `AppError` (403)
8. Call `next()` or `next(error)`

> Ownership of notes/posts is enforced in the **service layer** (queries filter on
> `{ _id, userId }`), so a user cannot reach another user's records and cannot
> infer whether they exist (returns 404, not 403).

---

## Services

### `services/auth.service.js`

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `userRegistration(data)` | `{ name, email, password, interests? }` | `user` document | Validates input, creates user, returns user |
| `userLogin(data)` | `{ email, password }` | `user` document | Validates input, finds user, compares password, returns user |

**Validation Rules:**
- `name`, `email`, `password` are required
- Email must match regex format
- Password must be at least 6 characters

---

### `services/notes.service.js`

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `createNote(data)` | `{ title, notes, userId }` | `note` document | Creates a new note with `status: "active"` |
| `getNotes(data)` | `{ userId }` | `notes[]` | **Uses Aggregation Pipeline** with `$lookup` to join Users |
| `getNoteById(data)` | `{ noteId, userId }` | `note` document | Finds single note by ID and user ID |
| `updateNote(data)` | `{ noteId, userId, title?, notes?, status? }` | `note` document | Partial update using `$set` |
| `deleteNote(data)` | `{ noteId, userId }` | `note` document | Deletes note by ID and user ID |

**Aggregation Pipeline Used In:** `getNotes`
- `$match` notes by `userId`
- `$lookup` from `users` collection
- `$unwind` userInfo
- `$sort` by `createdAt` descending
- `$project` to format output (excludes password)

---

### `services/interest.service.js`

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `getAllInterests(data)` | `{ page, limit, search }` | `{ interests[], pagination }` | List the global interest catalog (case-insensitive partial name search) |
| `getInterestById(data)` | `{ interestId }` | `interest` document | Look up one interest (404 if missing) |
| `findOrCreateInterest(name)` | `name` (string) | `interest` document | Find by name (case-insensitive) or create it — this is what lets a user add their own interest |
| `resolveInterests(interests)` | `string[]` (ids **or** names) | `interest[]` | Resolve a mixed array of ids/names; unknown ids → 404, unknown names → created |
| `addInterestToUser(data)` | `{ userId, interestId?, name? }` | `{ user, interest }` | Attach one interest to the user's own profile (409 if already present) |
| `removeInterestFromUser(data)` | `{ userId, interestId }` | `user` document | Detach one interest from the user's own profile (404 if not present) |
| `updateInterest(data)` | `{ interestId, name }` | `interest` document | **Admin**: rename a shared catalog entry (409 if the name is taken) |
| `updateUserInterest(data)` | `{ userId, interestId, name }` | `{ user, interest }` | Rename one of the user's own interests — isolated from other users (see rules) |
| `getUserInterests(data)` | `{ userId }` | `interest[]` | List the user's own interests (populated with names) |

**Rules:**
- Max **20** interests per user (`MAX_INTERESTS_PER_USER`)
- Max **50** characters per interest name (`MAX_INTEREST_NAME_LENGTH`)
- Names are trimmed, whitespace-collapsed and matched case-insensitively
- A concurrent duplicate create is caught (`error.code === 11000`) and resolved by re-reading the winning document
- Renaming: a blank name or a name over 50 chars → `400`; a name already used by another interest → `409`; an interest not on the caller's profile → `404`

---

### `services/users.service.js`

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `updateOwnPassword(data)` | `{ userId, oldPassword, newPassword }` | `user` document | User updates own password (verifies old password first) |
| `getAllUsers()` | — | `users[]` | Admin: get all users (password excluded) |
| `getUserById(data)` | `{ userId }` | `user` document | Admin: get user by ID (password excluded) |
| `updateUser(data)` | `{ userId, name?, email?, role?, interests? }` | `user` document | Admin: partial update user |
| `deleteUser(data)` | `{ userId }` | `user` document | Admin: delete user |
| `getUsersGroupedByInterest()` | — | `grouped[]` | **Uses Aggregation Pipeline** — groups all users by interest |

**Aggregation Pipeline Used In:** `getUsersGroupedByInterest`
- `$unwind` interests array
- `$lookup` from `interests` collection to resolve the interest **name**
- `$group` by interest ID with `$addToSet` (removes duplicate users)
- `$sort` by interest ID
- `$project` to format output (`interest` id, `name`, `users[]`)


**Logic:**
- Admin (`role === "admin"`) → allowed
- Regular user → `resourceUserId` must match `req.user._id`
- `resourceUserId` is read from `req.params.userId`, `req.body.userId`, or `req.query.userId`

---

## Controllers

### `controllers/auth.controller.js`

| Function | Route | Method | Auth Required | Description |
|----------|-------|--------|---------------|-------------|
| `register` | `/api/auth/register` | POST | No | Register new user, generate JWT pair, store hashed tokens in DB, set HTTP-only cookies |
| `login` | `/api/auth/login` | POST | No | Login user, generate JWT pair, store hashed tokens in DB, set HTTP-only cookies |
| `refreshToken` | `/api/auth/refresh-session` | POST | No (cookie-based) | Rotate access + refresh tokens using refresh token cookie; token reuse revokes session |
| `revoke` | `/api/auth/revoke` | POST | Yes (`authenticate`) | Revoke session by `ssid`, clear cookies |

**Cookie Configuration:**
- `accessToken`: `httpOnly: true`, `path: "/"`, `maxAge: 15m`
- `refreshToken`: `httpOnly: true`, `path: "/api/auth/refresh-session"`, `maxAge: 7d`

> The refresh cookie path **must** match the mounted route. A path of `"/refresh-session"`
> would never match the request path `/api/auth/refresh-session`, so the browser would
> not send the cookie back and the refresh would always fail.

**Security Features:**
- Tokens stored as SHA-256 hashes in database
- Access token + refresh token share same `ssid`
- `ssid` included in JWT payload
- Two-way token verification: signature check + database hash check
- Max 5 documents per `ssid` in Access collection (oldest deleted first)
- Token reuse detection → session revoked

---

### `controllers/notes.controller.js`

| Function | Route | Method | Auth Required | Description |
|----------|-------|--------|---------------|-------------|
| `createNotes` | `/api/notes` | POST | Yes (`authenticate("user","admin")`) | Create a new note |
| `getAllNotes` | `/api/notes` | GET | Yes (`authenticate("user","admin")`) | Get all notes for a user (uses aggregation) |
| `getSingleNote` | `/api/notes/:noteId` | GET | Yes (`authenticate("user","admin")`) | Get a single note |
| `updateNotes` | `/api/notes/:noteId` | PUT | Yes (`authenticate("user","admin")`) | Update a note |
| `deleteNotes` | `/api/notes/:noteId` | DELETE | Yes (`authenticate("user","admin")`) | Delete a note |

**Permission Logic:**
- `user` role: can CRUD only their own notes (ownership enforced in the service layer via `{ _id, userId }`)
- `admin` role: can access any note

---

### `controllers/users.controller.js`

| Function | Route | Method | Auth Required | Role Required | Description |
|----------|-------|--------|---------------|---------------|-------------|
| `updatePassword` | `/api/users/password` | PUT | Yes (`authenticate`) | Any | User updates their own password |
| `getUsers` | `/api/users` | GET | Yes (`authenticate`) | `admin` | Get all users |
| `getUser` | `/api/users/:userId` | GET | Yes (`authenticate`) | `admin` | Get user by ID |
| `updateUsers` | `/api/users/:userId` | PUT | Yes (`authenticate`) | `admin` | Update user (name, email, role, interests) |
| `deleteUsers` | `/api/users/:userId` | DELETE | Yes (`authenticate`) | `admin` | Delete user |
| `getUsersGroupedByInterest` | `/api/users/grouped/interest` | GET | Yes (`authenticate`) | Any | Get all users grouped by interest (aggregation) |

**Admin vs User Permissions:**
- **Admin-only routes:** `getUsers`, `getUser`, `updateUsers`, `deleteUsers` (protected by `authenticate("admin")`)
- **User-accessible routes:** `updatePassword`, `getUsersGroupedByInterest`

---

### `controllers/interests.controller.js`

| Function | Route | Method | Auth Required | Description |
|----------|-------|--------|---------------|-------------|
| `getInterests` | `/api/interests` | GET | No | List the interest catalog (public — used for sign-up suggestions) |
| `getInterest` | `/api/interests/:interestId` | GET | Yes (`authenticate`) | Get a single interest |
| `getMyInterests` | `/api/users/me/interests` | GET | Yes (`authenticate`) | List the authenticated user's own interests |
| `addInterest` | `/api/users/me/interests` | POST | Yes (`authenticate`) | Add an interest by `name` (created if new) or `interestId` |
| `removeInterest` | `/api/users/me/interests/:interestId` | DELETE | Yes (`authenticate`) | Remove one of the authenticated user's interests |
| `updateMyInterest` | `/api/users/me/interests/:interestId` | PUT | Yes (`authenticate`) | Rename one of the authenticated user's own interests |
| `updateInterest` | `/api/interests/:interestId` | PUT | Yes (`authenticate("admin")`) | Rename a shared catalog entry (admin) |

**Ownership:**
- The `me` routes always operate on `req.user._id` — a user can **never** modify another
  user's interests through them.
- Editing another user's interests remains an **admin-only** operation via
  `PUT /api/users/:userId`.

**Renaming — shared catalog caveat:**
- `PUT /api/interests/:interestId` edits the **shared** `Interest` document, so the new
  name appears for every user that has that interest. Admin-only for that reason.
- `PUT /api/users/me/interests/:interestId` is **isolated to the caller**:
  - if the caller is the only owner of the interest → it is renamed in place;
  - if other users share it → the caller is moved onto a separate interest carrying the
    new name and the shared entry is left untouched for the others.
  - The `interest._id` in the response may therefore differ from the requested id.

---

## Routes Summary

### Authentication Routes (`routes/authRoute.js`)

| Method | Path | Middleware | Controller |
|--------|------|------------|------------|
| POST | `/api/auth/register` | — | `register` |
| POST | `/api/auth/login` | — | `login` |
| POST | `/api/auth/refresh-session` | — | `refreshToken` |
| POST | `/api/auth/revoke` | `authenticate` | `revoke` |

### Notes Routes (`routes/noteRoute.js`)

| Method | Path | Middleware | Controller |
|--------|------|------------|------------|
| POST | `/api/notes` | `authenticate("user","admin")` | `createNotes` |
| GET | `/api/notes` | `authenticate("user","admin")` | `getAllNotes` |
| GET | `/api/notes/:noteId` | `authenticate("user","admin")` | `getSingleNote` |
| PUT | `/api/notes/:noteId` | `authenticate("user","admin")` | `updateNotes` |
| DELETE | `/api/notes/:noteId` | `authenticate("user","admin")` | `deleteNotes` |

### User Routes (`routes/userRoute.js`)

| Method | Path | Middleware | Controller |
|--------|------|------------|------------|
| PUT | `/api/users/password` | `authenticate` | `updatePassword` |
| GET | `/api/users` | `authenticate("admin")` | `getUsers` |
| GET | `/api/users/me/interests` | `authenticate` | `getMyInterests` |
| POST | `/api/users/me/interests` | `authenticate` | `addInterest` |
| PUT | `/api/users/me/interests/:interestId` | `authenticate` | `updateMyInterest` |
| DELETE | `/api/users/me/interests/:interestId` | `authenticate` | `removeInterest` |
| GET | `/api/users/:userId` | `authenticate("admin")` | `getUser` |
| PUT | `/api/users/:userId` | `authenticate("admin")` | `updateUsers` |
| DELETE | `/api/users/:userId` | `authenticate("admin")` | `deleteUsers` |
| GET | `/api/users/grouped/interest` | `authenticate` | `getUsersGroupedByInterest` |

### Interest Routes (`routes/interestRoute.js`)

| Method | Path | Middleware | Controller |
|--------|------|------------|------------|
| GET | `/api/interests` | — | `getInterests` |
| GET | `/api/interests/:interestId` | `authenticate` | `getInterest` |
| PUT | `/api/interests/:interestId` | `authenticate("admin")` | `updateInterest` |

> The `/api/users/me/interests` routes are registered **before** `/api/users/:userId`
> so the literal `me` segment is never captured as a user id.

---

## Aggregation Pipelines Used

### 1. `getNotes` — `services/notes.service.js`

**Purpose:** Fetch all notes for a user with user details joined.

```js
[
  { $match: { userId: new mongoose.Types.ObjectId(userId) } },
  { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "userInfo" } },
  { $unwind: "$userInfo" },
  { $sort: { createdAt: -1 } },
  { $project: { _id: 1, title: 1, notes: 1, status: 1, createdAt: 1, updatedAt: 1, user: { ... } } }
]
```

**Collections joined:** `notes` → `users`

### 2. `getUsersGroupedByInterest` — `services/users.service.js`

**Purpose:** Group all users by their interests.

```js

---

## How to Run

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   Edit `.env` with your MongoDB URI and JWT secrets.

3. **Start MongoDB** (ensure it's running on `mongodb://localhost:27017`).

4. **Start the server:**
   ```bash
   npm run dev
   ```

5. **Server runs on:** `http://localhost:5000`

---

## Postman Testing Flow

1. **Register:** `POST /api/auth/register` → returns `user`, `ssid`, sets cookies
2. **Login:** `POST /api/auth/login` → returns `user`, `ssid`, sets cookies
3. **Create Note:** `POST /api/notes` (body: `title`, `notes`, `userId`) → requires `accessToken` cookie
4. **Get Notes:** `GET /api/notes?userId=<id>` → requires `accessToken` cookie
5. **Update Profile:** `PUT /api/users/:userId` → admin only
6. **Group by Interest:** `GET /api/users/grouped/interest` → requires `accessToken` cookie
7. **Refresh:** `POST /api/auth/refresh-session` → requires `refreshToken` cookie (path: `/refresh-session`)
8. **Revoke:** `POST /api/auth/revoke` (body: `ssid`) → requires `accessToken` cookie

---

## Key Design Decisions

| Decision | Reason |
|----------|--------|
| Separate `Interest` collection | Interests are not embedded strings; they are referenced by ObjectId for normalization |
| HTTP-only cookies | Tokens are not exposed in JSON responses; stored securely in cookies |
| Token hashing in DB | Access and refresh tokens stored as SHA-256 hashes |
| Max 5 sessions per `ssid` | Prevents unlimited session storage; oldest deleted first |
| Token reuse detection | If old refresh token presented again, session is revoked |
| Two-way token verification | JWT signature + database hash match |
| Role-based access | `admin` can manage all users; `user` manages own profile and notes |

[
  { $unwind: "$interests" },
  { $group: { _id: "$interests", users: { $addToSet: { _id, name, email, role } } } },
  { $sort: { _id: 1 } },
  { $project: { _id: 0, interest: "$_id", users: 1 } }
]
```

**Collections used:** `users` only (interests stored as ObjectId array referencing `Interest` collection)

---

## Error Handling Pattern

All services and controllers follow this pattern:

```js
const functionName = async (data) => {
    try {
        // validation with if-else guards
        if (!field) {
            throw new AppError("Message", statusCode);
        } else {
            // business logic
            return result;
        }
    } catch (error) {
        throw error;  // services re-throw, controllers pass to next(error)
    }
};
```

**Controllers** use Express error forwarding:
```js
app.use((err, req, res, next) => {
    const status = err.status || 500;
    res.status(status).json({
        success: false,
        message: err.message || "Internal Server Error"
    });
});
```

| `createdAt`, `updatedAt` | Date | No | Auto timestamps |

**Indexes:**
- `title` — indexed
- `notes` — indexed

---

### 4. `access.model.js` — Access Collection

**Schema Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | ObjectId | Yes | Reference to `Users` |
| `ssid` | String | Yes (unique) | Session ID |
| `accessToken` | String | Yes | Hashed access token |
| `refreshToken` | String | Yes | Hashed refresh token |
| `expiresAt` | Date | Yes | Token expiry date |
| `isRevoked` | Boolean | No | Default `false` |
| `createdAt`, `updatedAt` | Date | No | Auto timestamps |

