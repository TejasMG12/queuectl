// db.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const HOME = os.homedir();
const APP_DIR = path.join(HOME, '.queuectl'); // fixed location so all processes share DB
if (!fs.existsSync(APP_DIR)) fs.mkdirSync(APP_DIR, { recursive: true });

const DB_PATH = process.env.QUEUECTL_DB_PATH || path.join(APP_DIR, 'queue.db');

const db = new Database(DB_PATH);

// initialize schema
function migrate() {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      command TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      run_at TEXT,
      locked_by TEXT,
      locked_at TEXT,
      error TEXT,
      output TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_state_runat ON jobs(state, run_at, created_at);
  `);

  // default config rows
  db.prepare(`INSERT OR IGNORE INTO config (key, value) VALUES (\'workers_stopped\', \'0\');`).run();
  const getCfg = db.prepare('SELECT value FROM config WHERE key = ?');
  const insertCfg = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?);');
  if (!getCfg.get('max_retries')) insertCfg.run('max_retries', String(3));
  if (!getCfg.get('backoff_base')) insertCfg.run('backoff_base', String(2));
  if (!getCfg.get('worker_poll_interval_ms')) insertCfg.run('worker_poll_interval_ms', String(1000));
}

migrate();

/* Config helpers */
const getConfig = (key) => {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : null;
};
const setConfig = (key, value) => {
  db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, String(value));
};

/* Jobs helpers */
const nowISO = () => new Date().toISOString();

const createJob = (job) => {
  const stmt = db.prepare(`
    INSERT INTO jobs (id, command, state, attempts, max_retries, created_at, updated_at, run_at)
    VALUES (@id, @command, @state, @attempts, @max_retries, @created_at, @updated_at, @run_at)
  `);
  const full = {
    id: job.id,
    command: job.command,
    state: job.state || 'pending',
    attempts: job.attempts || 0,
    max_retries: job.max_retries || Number(getConfig('max_retries') || 3),
    created_at: job.created_at || nowISO(),
    updated_at: job.updated_at || nowISO(),
    run_at: job.run_at || null
  };
  stmt.run(full);
  return getJob(full.id);
};

const getJob = (id) => db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);

const listJobs = (state = null) => {
  if (state) return db.prepare('SELECT * FROM jobs WHERE state = ? ORDER BY created_at DESC').all(state);
  return db.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all();
};

const listDLQ = () => db.prepare(`SELECT * FROM jobs WHERE state = 'dead' ORDER BY updated_at DESC`).all();

/*
 * Atomically claim a pending job (that is due to run) and return it.
 * Uses transaction to avoid races across processes.
 */
const claimNextJob = (workerId) => {
  const tx = db.transaction(() => {
    // find a pending job where run_at is null OR run_at <= now
    const now = new Date().toISOString();
    const row = db.prepare(`
      SELECT id FROM jobs
      WHERE state = 'pending' AND (run_at IS NULL OR run_at <= ?)
      ORDER BY created_at ASC
      LIMIT 1
    `).get(now);

    if (!row) return null;

    // lock it by setting state=processing and locked_by
    const update = db.prepare(`
      UPDATE jobs
      SET state = 'processing', locked_by = ?, locked_at = ?, updated_at = ?
      WHERE id = ?
    `);
    update.run(workerId, now, now, row.id);
    return db.prepare('SELECT * FROM jobs WHERE id = ?').get(row.id);
  });

  return tx();
};

const markJobCompleted = (id, output = null) => {
  const now = nowISO();
  db.prepare(`
    UPDATE jobs SET state = 'completed', updated_at = ?, output = ?, locked_by = NULL, locked_at = NULL
    WHERE id = ?
  `).run(now, output, id);
  return getJob(id);
};

const markJobFailed = (id, error) => {
  const now = nowISO();
  db.prepare(`
    UPDATE jobs SET state = 'failed', updated_at = ?, error = ?, locked_by = NULL, locked_at = NULL
    WHERE id = ?
  `).run(now, error, id);
  return getJob(id);
};

const incrementAttemptsAndSchedule = (id, backoffSeconds) => {
  const now = nowISO();
  // update attempts, set state to pending and set run_at to now + backoffSeconds
  const runAtExpr = new Date(Date.now() + backoffSeconds * 1000).toISOString();
  db.prepare(`
    UPDATE jobs
    SET attempts = COALESCE(attempts,0) + 1,
        updated_at = ?,
        state = 'pending',
        run_at = ?,
        locked_by = NULL,
        locked_at = NULL
    WHERE id = ?
  `).run(now, runAtExpr, id);
  return getJob(id);
};

const moveToDLQ = (id, reason) => {
  const now = nowISO();
  db.prepare(`
    UPDATE jobs SET state = 'dead', error = ?, updated_at = ?, locked_by = NULL, locked_at = NULL
    WHERE id = ?
  `).run(reason, now, id);
  return getJob(id);
};

const retryFromDLQ = (id) => {
  const now = nowISO();
  db.prepare(`
    UPDATE jobs
    SET state = 'pending', attempts = 0, updated_at = ?, run_at = NULL, error = NULL
    WHERE id = ? AND state = 'dead'
  `).run(now, id);
  return getJob(id);
};

const deleteJob = (id) => {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
};

function setWorkersStopped(flag) {
  db.prepare(`INSERT OR REPLACE INTO config (key, value) VALUES ('workers_stopped', ?)`).run(flag ? '1' : '0');
}

function areWorkersStopped() {
  const row = db.prepare(`SELECT value FROM config WHERE key='workers_stopped'`).get();
  return row && row.value === '1';
}
function getJobCounts() {
  return db.prepare(`
    SELECT
      SUM(CASE WHEN state='pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN state='processing' THEN 1 ELSE 0 END) AS processing,
      SUM(CASE WHEN state='completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN state='failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN state='dead' THEN 1 ELSE 0 END) AS dead
    FROM jobs
  `).get();
}

async function listJobsByState(state) {
  const db = await getDb();
  const rows = await db.all(
    `SELECT id, command, state, attempts, max_retries, created_at, updated_at
     FROM jobs
     WHERE state = ?
     ORDER BY created_at DESC`,
    [state]
  );
  return rows;
}

// async function listDLQ() {
//   const rows = await db.all(`SELECT * FROM dlq ORDER BY failed_at DESC`);
//   return rows;
// }

async function retryDLQJob(id) {
  await db.run(`INSERT INTO jobs (id, command, state, attempts, max_retries, created_at)
                SELECT id, command, 'pending', 0, max_retries, datetime('now')
                FROM dlq WHERE id = ?`, [id]);
  await db.run(`DELETE FROM dlq WHERE id = ?`, [id]);
}


module.exports = {
  db,
  DB_PATH,
  getConfig,
  setConfig,
  createJob,
  getJob,
  listJobs,
  listDLQ,
  claimNextJob,
  markJobCompleted,
  markJobFailed,
  incrementAttemptsAndSchedule,
  moveToDLQ,
  retryFromDLQ,
  deleteJob,
  nowISO,
  setWorkersStopped,
  areWorkersStopped,
  getJobCounts,
  listJobsByState,
  listDLQ,
  retryDLQJob
};
