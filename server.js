const express = require('express');
const app = express();
const db = require('./db');
const redisClient = require('./redis');
const supabase = require('./supabaseClient');
const requireAuth = require('./authMiddleware');
const swaggerUi = require('swagger-ui-express');
const openapiSpec = require('./openapi.json');
const { TriageInputSchema, TriageOutputSchema } = require('./src/llm/schema');
const fs = require('fs');
const path = require('path');
const parseAndValidate = require('./src/llm/parseAndValidate');
const { callModel, PROMPT_VERSION } = require('./src/llm/callModel');
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));
const PORT = 3000;
app.use(express.json());

app.post('/triage', async (req, res) => {
  if (process.env.LLM_ENABLED === 'false') {
    return res.status(503).json({ error: 'AI triage is temporarily disabled' });
  }

  const inputResult = TriageInputSchema.safeParse(req.body);
  if (!inputResult.success) {
    const firstIssue = inputResult.error.issues[0];
    return res.status(400).json({ error: `Invalid field: ${firstIssue.path.join('.')} — ${firstIssue.message}` });
  }

  if (process.env.LLM_STUB === '1') {
    const stubResponse = {
      category: 'other',
      urgency: 'low',
      confidence: 0.5,
      reason: 'Stub mode response — no model was called.',
    };
    return res.status(200).json(TriageOutputSchema.parse(stubResponse));
  }

  const userText = inputResult.data.text;

  // First attempt
  let rawOutput = await callModel(userText);
  let result = parseAndValidate(rawOutput);

  // One repair attempt if the first failed
  if (!result.success) {
    const firstError = result.error;
    rawOutput = await callModel(userText, { previousOutput: rawOutput, error: firstError });
    result = parseAndValidate(rawOutput);
  }

  if (!result.success) {
    const quarantineLine = JSON.stringify({
      timestamp: new Date().toISOString(),
      input: userText,
      raw_output: rawOutput,
      error: result.error,
      prompt_version: PROMPT_VERSION,
    });
    fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });
    fs.appendFileSync(path.join(__dirname, 'logs', 'quarantine.jsonl'), quarantineLine + '\n');

    return res.status(422).json({ error: 'Model output failed validation after repair attempt' });
  }

  res.status(200).json(result.data);
});

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

app.get('/protected/profile', requireAuth, (req, res) => {
  res.status(200).json({
    id: req.user.id,
    email: req.user.email,
    created_at: req.user.created_at,
  });
});

app.post('/auth/logout', requireAuth, async (req, res) => {
  await supabase.auth.signOut();
  res.status(204).send();
});

app.get('/protected/dashboard', requireAuth, (req, res) => {
  res.json({ message: `Welcome to your dashboard, ${req.user.email}` });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});