require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgres://postgres:dev@localhost:5432/tasks',
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      done BOOLEAN NOT NULL DEFAULT false
    )
  `);

  const { rows } = await pool.query('SELECT COUNT(*) AS count FROM tasks');
  if (parseInt(rows[0].count) === 0) {
    await pool.query(
      'INSERT INTO tasks (title, done) VALUES ($1, $2), ($3, $4), ($5, $6)',
      ['Buy milk', false, 'Walk the dog', true, 'Finish assignment', false]
    );
  }
}

init();

module.exports = pool;