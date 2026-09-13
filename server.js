const express = require('express');
const app = express();
const db = require('./db');
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

app.get('/tasks', (req, res) => {
  const tasks = db.prepare('SELECT * FROM tasks').all();
  res.json(tasks);
});

app.get('/tasks/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  res.json(task);
});

app.post('/tasks', (req, res) => {
  const { title } = req.body;

  if (!title || title.trim() === "") {
    return res.status(400).json({ error: "Title is required" });
  }

  const insert = db.prepare('INSERT INTO tasks (title, done) VALUES (?, ?)');
  const result = insert.run(title, 0);

  const newTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(newTask);
});

app.put('/tasks/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  const { title, done } = req.body;
  if (title !== undefined && title.trim() === "") {
    return res.status(400).json({ error: "Title cannot be empty" });
  }

  const newTitle = title !== undefined ? title : task.title;
  const newDone = done !== undefined ? (done ? 1 : 0) : task.done;

  db.prepare('UPDATE tasks SET title = ?, done = ? WHERE id = ?')
    .run(newTitle, newDone, req.params.id);
  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  res.json(updated);
});

app.delete('/tasks/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});