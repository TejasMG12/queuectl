#!/usr/bin/env node
// index.js - CLI entry
const { program } = require('commander');
const pkg = require('./package.json');

program.version(pkg.version || '0.0.0');

program
  .command('enqueue <jobJson>')
  .description('Enqueue a job (JSON string or file:@path)')
  .action(require('./commands/enqueue'));

const worker = program
  .command('worker')
  .description('Run a worker process');

worker
  .command('start')
  .description('Start worker processes')
  .option('-c, --count <n>', 'number of workers', '1')
  .option('-i, --id <id>', 'worker id prefix', null)
  .action(require('./commands/worker').start);

worker
  .command('stop')
  .description('Stop all workers gracefully')
  .action(require('./commands/worker').stop);

worker
  .command('once')
  .description('Run a single job once (for testing)')
  .option('-t, --timeout <ms>', 'max wait time for a job', '10000')
  .action(require('./commands/worker').runOnce);

program
  .command('status')
  .description('Show summary of job states and workers (local view)')
  .action(require('./commands/status'));

program
  .command('list')
  .description('List jobs')
  .option('-s, --state <state>', 'filter by state')
  .action(require('./commands/list'));

const dlq = program
  .command('dlq')
  .description('Manage dead-letter queue (DLQ) jobs');

dlq
  .command('list')
  .description('List dead (DLQ) jobs')
  .action(require('./commands/dlq').list);

dlq
  .command('retry <id>')
  .description('Retry a job from DLQ (move back to pending)')
  .action(require('./commands/dlq').retry);

const config = program
  .command('config')
  .description('Get or set configuration values');

config
  .command('set <key> <value>')
  .description('Set configuration (max_retries, backoff_base, worker_poll_interval_ms)')
  .action(require('./commands/config').set);

config
  .command('get [key]')
  .description('Get configuration')
  .action(require('./commands/config').get);

program.parse(process.argv);