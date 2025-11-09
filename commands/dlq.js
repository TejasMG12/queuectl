// dlq.js
const { listDLQ, retryFromDLQ, getJob } = require('../db');

module.exports.list = () => {
  const rows = listDLQ();
  if (!rows.length) {
    console.log('DLQ is empty.');
    return;
  }
  rows.forEach((r) => {
    console.log(`${r.id} | error:${r.error || ''} | attempts:${r.attempts} | cmd:${r.command}`);
  });
};

module.exports.retry = (id) => {
  const job = getJob(id);
  if (!job || job.state !== 'dead') {
    console.error('Job not found in DLQ:', id);
    process.exit(1);
  }
  retryFromDLQ(id);
  console.log('Job moved back to pending:', id);
};
