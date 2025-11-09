// list.js
const { listJobs } = require('../db');

module.exports = (opts) => {
  const state = opts && opts.state ? opts.state : null;
  const rows = listJobs(state);
  if (!rows.length) {
    console.log('No jobs found.');
    return;
  }
  rows.forEach((r) => {
    console.log(`${r.id} | ${r.state} | attempts:${r.attempts} | max_retries:${r.max_retries} | run_at:${r.run_at || ''} | cmd:${r.command}`);
  });
};
