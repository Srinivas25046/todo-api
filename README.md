# Task API

A small in-memory to-do list API built with Node.js and Express, supporting full CRUD (Create, Read, Update, Delete) on tasks. Built as part of the FlyRank Internship, Backend Track, Week 2.

## How to run it

**Requirements:** Node.js 18+ installed.

```bash
git clone https://github.com/YOUR_USERNAME/todo-api.git
cd todo-api
npm install
node server.js
```

The server starts on `http://localhost:3000`.

Interactive API docs (Swagger UI) are available at `http://localhost:3000/docs`.

## Endpoints

| Method | Path | Description | Success | Errors |
|---|---|---|---|---|
| GET | `/` | API info | 200 | — |
| GET | `/health` | Health check | 200 | — |
| GET | `/tasks` | List all tasks | 200 | — |
| GET | `/tasks/:id` | Get a single task | 200 | 404 |
| POST | `/tasks` | Create a task | 201 | 400 |
| PUT | `/tasks/:id` | Update a task | 200 | 400, 404 |
| DELETE | `/tasks/:id` | Delete a task | 204 | 404 |

Each task has: `id` (number), `title` (string), `done` (boolean).

## Example request

```bash
curl -i -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Buy milk"}'
```

```
HTTP/1.1 201 Created
Content-Type: application/json; charset=utf-8

{"id":4,"title":"Buy milk","done":false}
```

## Swagger UI

![Swagger UI screenshot](./swagger-screenshot.png)


## Notes

- Data is stored **in memory only** — restarting the server resets it back to the 3 seed tasks. This is intentional; persistence with a real database is Week 3's topic.
- The server never trusts client input: `title` is required and validated on both create and update.

## Database

This project stores tasks in **SQLite**, using Node's built-in `node:sqlite`
module (rather than a separate package like `better-sqlite3`) after running
into a native-binary compatibility crash on Windows during development.
`node:sqlite` needs no compiled binary at all, so it sidesteps that class of
problem entirely.

**Why SQLite:** a single file, zero server setup, and — unlike the in-memory
version from Week 2 — data now survives a server restart.

`tasks.db` is created automatically the first time the server runs, and is
git-ignored so every fresh clone starts with a clean, auto-seeded database.
