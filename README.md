# FamiTube API

Backend REST API and MySQL data store for FamiTube (used by `famitube-web` and `famitube-android`).

## Setup

1. Copy `.env.example` to `.env` and configure your MySQL connection:
   ```bash
   cp .env.example .env
   ```
   Set `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE` (or `DATABASE_URL`).

2. Install dependencies and start the server:
   ```bash
   npm install
   npm run dev
   ```

On startup, the API automatically creates the database (when using `MYSQL_*` variables), creates the required tables (`categories`, `channels`, `videos`, `playlists`, `app_config`), and seeds initial sample data if the tables are empty.

The API listens on `http://localhost:4000/api` (or `PORT` from `.env`).
