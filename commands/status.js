// status.js
const { listJobs, db } = require('../db');

module.exports = () => {
  const all = listJobs();
  const counts = all.reduce((acc, j) => {
    acc[j.state] = (acc[j.state] || 0) + 1;
    return acc;
  }, {});

  console.log('Jobs summary:');
  console.table(counts);

  console.log('Recent jobs (top 10):');
  const recent = all.slice(0, 10);
  recent.forEach((j) => {
    console.log(`${j.id} | ${j.state} | attempts:${j.attempts} | cmd:${j.command} | updated:${j.updated_at}`);
  });

  // local worker view: cannot see other processes' live workers in this simple setup
  console.log('\nNote: worker processes are external; run `worker start` to start local workers.\n');
};
