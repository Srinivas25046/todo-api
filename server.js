const express = require('express');
const app = express();
const db = require('./db');
const redisClient = require('./redis');
const supabase = require('./supabaseClient');
const swaggerUi = require('swagger-ui-express');
const openapiSpec = require('./openapi.json');
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));
const PORT = 3000;
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    name: "Task API",
    version: "1.0",
    endpoints: ["/tasks"]
  });
});

app.get('/health', (req, res) => {
  res.json({ status: "ok" });
});

app.get('/tasks', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM tasks');
  res.json(rows);
});

app.get('/tasks/:id', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
  if (rows.length === 0) {
    return res.status(404).json({ error: "Task not found" });
  }
  res.json(rows[0]);
});

app.post('/tasks', async (req, res) => {
  const { title } = req.body;
  if (!title || title.trim() === "") {
    return res.status(400).json({ error: "Title is required" });
  }
  const { rows } = await db.query(
    'INSERT INTO tasks (title, done) VALUES ($1, $2) RETURNING *',
    [title, false]
  );
  res.status(201).json(rows[0]);
});

app.put('/tasks/:id', async (req, res) => {
  const existing = await db.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: "Task not found" });
  }

  const { title, done } = req.body;
  if (title !== undefined && title.trim() === "") {
    return res.status(400).json({ error: "Title cannot be empty" });
  }

  const task = existing.rows[0];
  const newTitle = title !== undefined ? title : task.title;
  const newDone = done !== undefined ? done : task.done;

  const { rows } = await db.query(
    'UPDATE tasks SET title = $1, done = $2 WHERE id = $3 RETURNING *',
    [newTitle, newDone, req.params.id]
  );
  res.json(rows[0]);
});

app.delete('/tasks/:id', async (req, res) => {
  const existing = await db.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: "Task not found" });
  }
  await db.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
  res.status(204).send();
});

app.post('/auth/signup', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.status(201).json(data.user);
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return res.status(401).json({ error: "Invalid login credentials" });
  }

  res.status(200).json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
});

app.get('/public/info', (req, res) => {
  res.status(200).json({ message: "Welcome stranger! This info is public." });
});

app.get('/protected/profile', (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Access token required" });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  res.status(200).json({ message: "Token was present (not yet verified)" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});