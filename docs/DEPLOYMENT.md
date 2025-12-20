# Deployment Guide

## Prerequisites
- **Node.js** (v18+)
- **Bun** (v1.0+) - Recommended for Server
- **PostgreSQL** or **SQLite** (via Drizzle ORM)

## Server Deployment
1. Navigate to `server/`.
2. Install dependencies: `bun install`.
3. Set environment variables (create `.env`):
   ```
   DATABASE_URL=file:local.db
   JWT_SECRET=your_secret_key
   ```
4. Run migrations (if applicable) or start server:
   ```bash
   bun run src/index.ts
   ```
   Server runs on port 3000 by default.

## Client Deployment
1. Navigate to `client/`.
2. Install dependencies: `npm install`.
3. Build for production:
   ```bash
   npm run build
   ```
   Output will be in `client/dist/`.
4. Serve the `dist/` folder using Nginx, Apache, or a static file server.
   - **Nginx Config Example:**
     ```nginx
     location / {
       root /path/to/client/dist;
       try_files $uri $uri/ /index.html;
     }
     location /api {
       proxy_pass http://localhost:3000;
     }
     ```

## Verification
- Access the web application.
- Login as Admin (default credentials usually provided in seed data).
- Verify Dashboard loads without 401/403 errors.
