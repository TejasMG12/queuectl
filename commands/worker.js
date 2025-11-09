// worker.js
const { spawn } = require('child_process');
const os = require('os');
const {
  claimNextJob,
  markJobCompleted,
  markJobFailed,
  incrementAttemptsAndSchedule,
  moveToDLQ,
  getConfig,
  areWorkersStopped,
  setWorkersStopped
} = require('../db');

const DEFAULT_POLL = 1000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function workerLoop(workerId) {
  console.log(`[${workerId}] started`);

  while (true) {
    if (areWorkersStopped()) {
      console.log(`[${workerId}] stop signal received, exiting gracefully...`);
      break;
    }

    try {
      const cfgPoll = Number(getConfig('worker_poll_interval_ms') || DEFAULT_POLL);
      const job = claimNextJob(workerId);

      if (!job) {
        await sleep(cfgPoll);
        continue;
      }

      console.log(`[${workerId}] claimed job ${job.id}`);

      const execResult = await executeCommand(job.command);

      if (execResult.success) {
        markJobCompleted(job.id, execResult.output || null);
        console.log(`[${workerId}] job ${job.id} completed`);
      } else {
        console.error(`[${workerId}] job ${job.id} failed`);

        const cfgBackoffBase = Number(getConfig('backoff_base') || 2);
        const nextAttempts = (job.attempts || 0) + 1;

        if (nextAttempts > job.max_retries) {
          moveToDLQ(job.id, `exhausted after ${nextAttempts} attempts`);
          console.log(`[${workerId}] job ${job.id} moved to DLQ`);
        } else {
          const delaySec = Math.pow(cfgBackoffBase, nextAttempts);
          incrementAttemptsAndSchedule(job.id, delaySec);
          console.log(`[${workerId}] scheduled retry #${nextAttempts} in ${delaySec}s`);
        }
      }
    } catch (err) {
      console.error(`[${workerId}] unexpected error`, err);
      await sleep(1000);
    }
  }

  console.log(`[${workerId}] stopped`);
}

function executeCommand(cmd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });

    let out = '';
    let err = '';

    child.stdout.on('data', (b) => (out += b.toString()));
    child.stderr.on('data', (b) => (err += b.toString()));

    child.on('error', (errObj) => {
      resolve({ success: false, code: null, error: errObj.message, output: out + err });
    });

    child.on('exit', (code) => {
      const success = code === 0;
      resolve({ success, code, error: err || null, output: out || null });
    });
  });
}

module.exports.start = async (opts) => {
  const count = parseInt(opts.count || 1, 10);
  const idPrefix = opts.id || `pid-${process.pid}`;

  if (opts.once) {
    await require('./workerLoop').runOnce(`${idPrefix}-1`);
    return;
  }

  console.log(`Starting ${count} workers...`);
  setWorkersStopped(false);

  const workers = [];
  for (let i = 0; i < count; i++) {
    workers.push(workerLoop(`${idPrefix}-${i + 1}`));
  }
  await Promise.all(workers);
  console.log('All workers exited.');
}

module.exports.stop = async () => {
  console.log('Sending stop signal to workers...');
  setWorkersStopped(true);
}


module.exports.runOnce = async (opts) => {
  const { timeout = 10000 } = opts;
  const workerId = `test-worker-${Date.now()}`;
  let job = null;
  const startTime = Date.now();

  while (!job && (Date.now() - startTime <= timeout)) {
    const cfgPoll = Number(getConfig('worker_poll_interval_ms') || DEFAULT_POLL);
    await sleep(cfgPoll);

   
    if (Date.now() - startTime > timeout) {
      break; 
    }

    job = claimNextJob(workerId);
  }

  if (!job) {
    console.log(`Worker ${workerId} found no job within ${timeout}ms timeout.`);
    return false;
  }
  const execResult = await executeCommand(job.command);

  if (execResult.success) {
    markJobCompleted(job.id, execResult.output || null);
  } else {
    const nextAttempts = (job.attempts || 0) + 1;
    const cfgBackoffBase = Number(getConfig("backoff_base") || 2);

    if (nextAttempts > job.max_retries) {
      moveToDLQ(job.id, `exhausted after ${nextAttempts} attempts`);
    } else {
      const delaySec = Math.pow(cfgBackoffBase, nextAttempts);
      incrementAttemptsAndSchedule(job.id, delaySec);
    }
  }

  return true;
};
