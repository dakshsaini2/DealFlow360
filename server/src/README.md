# Server source layout

```
src/
├── index.ts                  app wiring: json parser, routes, 404 + error handlers
├── common/                   cross-module building blocks
│   ├── errors/               AppError (base) + AuthError family
│   ├── middleware/           requireAuth / requireRole, notFoundHandler / errorHandler
│   ├── types/                JwtPayload, UserRole, Express Request augmentation
│   └── utils/                env config, prisma client, password + token helpers
└── modules/
    └── auth/                 routes → controller → service → prisma
```

## Layers

| File | Responsibility |
| --- | --- |
| `auth.routes.ts` | URL → middleware → controller wiring only |
| `auth.controller.ts` | Parses the request, calls the service, shapes the response, forwards errors to `next` |
| `auth.service.ts` | Business rules and persistence; throws domain errors, never touches `req`/`res` |
| `auth.types.ts` | DTOs (`SignupInput`, `AuthResult`, `PublicUser`) and `parseCredentials` validation |

No handler writes an error response itself. Everything throws an `AppError`
subclass and `errorHandler` turns it into `{ error: { code, message, details? } }`
with the right status. Unknown errors are logged and become a generic 500
(the message is only echoed outside production).

## Endpoints

| Method | Path | Auth | Body |
| --- | --- | --- | --- |
| `GET` | `/api/health` | – | – |
| `POST` | `/api/auth/signup` | – | `{ email, password }` |
| `POST` | `/api/auth/login` | – | `{ email, password }` |
| `GET` | `/api/auth/me` | Bearer | – |

Signup and login return `{ token, user: { id, email, role } }`. Emails are
normalized (trimmed + lowercased) and passwords must be at least 8 characters.

## Environment

`DATABASE_URL` and `JWT_SECRET` are required at boot; `PORT` (3000),
`JWT_EXPIRES_IN` (`1d`) and `BCRYPT_SALT_ROUNDS` (10) have defaults.
All of them are read once in `common/utils/env.ts` — read config from there,
not from `process.env`.

Run `npx prisma generate` after changing `prisma/schema.prisma`; the client is
emitted to `src/generated/prisma` and is not committed.
