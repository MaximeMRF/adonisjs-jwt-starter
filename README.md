# AdonisJS JWT starter

An AdonisJS v7 API with JWT authentication and refresh tokens, built with [@maximemrf/adonisjs-jwt](https://github.com/MaximeMRF/adonisjs-jwt).

It's the official [API starter kit](https://github.com/adonisjs/api-starter-kit) with its opaque access tokens replaced by:

- short-lived JWT access tokens (15 minutes);
- one-time refresh tokens stored in the database (7 days);
- functional tests for the whole flow.

## Getting started

```sh
git clone https://github.com/MaximeMRF/adonisjs-jwt-starter.git
cd adonisjs-jwt-starter
npm install
cp .env.example .env
node ace generate:key
node ace migration:run
npm run dev
```

The API listens on `http://localhost:3333`. It uses SQLite, so there's no database to set up.

## Endpoints

| Method | Route                     | Auth             | Body                                                    |
| ------ | ------------------------- | ---------------- | ------------------------------------------------------- |
| POST   | `/api/v1/auth/signup`     | -                | `fullName`, `email`, `password`, `passwordConfirmation` |
| POST   | `/api/v1/auth/login`      | -                | `email`, `password`                                     |
| POST   | `/api/v1/auth/refresh`    | -                | `refreshToken`                                          |
| POST   | `/api/v1/auth/logout`     | -                | `refreshToken`                                          |
| GET    | `/api/v1/account/profile` | `Bearer <token>` | -                                                       |

`signup`, `login` and `refresh` return a new token pair:

```json
{
  "data": {
    "type": "bearer",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "15m",
    "refreshToken": "rt_MQ.xxxxxxxx",
    "refreshTokenExpiresIn": "7d"
  }
}
```

`signup` and `login` also return the `user`.

## The flow

```sh
# log in
curl -X POST http://localhost:3333/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"jane@example.com","password":"secret-password"}'

# call a protected route with the access token
curl http://localhost:3333/api/v1/account/profile \
  -H 'Authorization: Bearer <token>'

# when the access token expires (401), get a new pair
curl -X POST http://localhost:3333/api/v1/auth/refresh \
  -H 'content-type: application/json' \
  -d '{"refreshToken":"<refreshToken>"}'

# log out: deletes the refresh token
curl -X POST http://localhost:3333/api/v1/auth/logout \
  -H 'content-type: application/json' \
  -d '{"refreshToken":"<refreshToken>"}'
```

A refresh token works once: each refresh returns a new one and deletes the old one. The access token can't be revoked, so it stays valid until it expires: the client drops it on logout.

`refresh` and `logout` don't use the `auth` middleware, since the access token has usually expired when the client calls them.

## Where things are

| File                                          | What it does                                     |
| --------------------------------------------- | ------------------------------------------------ |
| `config/auth.ts`                              | The `jwt` guard: token lifetimes, refresh tokens |
| `app/models/user.ts`                          | The `refreshTokens` provider                     |
| `app/controllers/access_tokens_controller.ts` | Login, refresh and logout                        |
| `app/controllers/new_account_controller.ts`   | Signup                                           |
| `start/routes.ts`                             | Routes                                           |
| `tests/functional/auth.spec.ts`               | Tests of the whole flow                          |

## Tests

```sh
npm test
```

The tests cover signup, login, protected routes, refresh, refresh token reuse, logout, and rejected tokens: missing, signed with another key, modified payload, a refresh token used as access token and the reverse. They run against their own SQLite database (`tmp/test.sqlite3`).

In your own tests, `loginAs` works with the JWT guard:

```ts
const response = await client.get('/api/v1/account/profile').loginAs(user)
```

## Going further

See the [documentation](https://maximemrf.github.io/adonisjs-jwt/) for cookies, asymmetric keys, JWKS (Auth0, Keycloak, Cognito, Kubernetes) and security.
