// enqueue.js
const fs = require('fs');
const { createJob } = require('../db');
const { v4: uuidv4 } = require('uuid');

module.exports = (jobJson) => {
  try {
    let payload = jobJson;
    if (jobJson.startsWith('@')) {
      const p = jobJson.slice(1);
      payload = fs.readFileSync(p, 'utf8');
    }
    const parsed = JSON.parse(payload);
    if (!parsed.id) parsed.id = uuidv4();
    if (!parsed.command) throw new Error('job must include "command"');
    const job = createJob(parsed);
    console.log('Enqueued job:', job.id);
  } catch (e) {
    console.error('Failed to enqueue:', e.message);
    process.exit(1);
  }
};
