# PORTA-Server

Backend API for the JP AMOTA Medical Waste Management platform.

## Stack

- NestJS
- Prisma ORM
- PostgreSQL
- JWT authentication with role-based permissions

## Responsibilities

- Authentication and authorization
- Facility, collection, route, manifest, invoice, payment, receipt, and document APIs
- Branding, settings, notification, and reporting services
- PDF generation and SMTP-backed email delivery

## Environment

Create a local `.env` file from `.env.example`.

```env
DATABASE_URL="postgresql://postgres:password@hostname:5432/porta_server?schema=public"
JWT_SECRET="replace-with-a-long-random-secret"
PORT=4000
CORS_ORIGINS="http://localhost:3000,http://localhost:3003"
GOOGLE_MAPS_API_KEY=""
```

## Install

```bash
npm install
```

## Development

```bash
npm run start:dev
```

## Database

```bash
npx prisma migrate deploy
npm run db:seed
```

## Test

```bash
npm run test
npm run test:e2e
```

## Production

```bash
npm run build
npm run start:prod
```

## Release Notes

- Keep `.env`, local Prisma database files, `dist`, and `node_modules` out of Git.
- Frontend portals expect this API at the configured `API_BASE_URL`.
- Default API port is `4000`.
