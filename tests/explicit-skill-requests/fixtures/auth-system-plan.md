# Auth System Implementation Plan

Express + Node 20, ESM, `node --test`. Tasks are ordered; each one ends green.

## Task 1: Add User Model

**File:** `src/user.js`

**Requirements:**
- Export `createUser({ email, password })` returning `{ id, email, passwordHash }`
- Hash the password with `node:crypto` `scrypt`, 16-byte random salt, store `salt:hash` hex
- Export `verifyPassword(user, password)` returning a boolean, compared with `timingSafeEqual`
- Reject an email without `@` and a password under 8 characters with a thrown `Error`

**Tests:** `test/user.test.js` — happy path, wrong password, both rejections.

**Verification:** `npm test`

## Task 2: Add Auth Routes

**File:** `src/routes/auth.js`

**Requirements:**
- Export `authRouter(store)` returning an Express router
- `POST /register` — 201 with `{ id, email }`, 409 when the email is taken
- `POST /login` — 200 with `{ token }`, 401 on a bad password or unknown email
- `store` is the in-memory `Map` the caller passes; no database

**Tests:** `test/auth-routes.test.js` — register, duplicate register, login, bad login.

**Verification:** `npm test`

## Task 3: Add JWT Middleware

**File:** `src/middleware/jwt.js`

**Requirements:**
- Export `signToken(user, secret)` with a 24-hour expiry
- Export `requireAuth(secret)` — Express middleware setting `req.user`, 401 on a
  missing, malformed or expired token
- HS256 only; reject a token whose header names another algorithm

**Tests:** `test/jwt.test.js` — valid token, expired token, missing header, `alg: none`.

**Verification:** `npm test`
