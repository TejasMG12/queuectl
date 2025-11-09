const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const TEST_DB = path.join(__dirname, "test.db");
const CLI = path.join(__dirname, "..", "index.js"); 

// Deletes old DB before tests run
function resetDB() {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
}

function cli(...args) {
  const result = spawnSync("node", [CLI, ...args], {
    env: { ...process.env, QUEUECTL_DB_PATH: TEST_DB },
    encoding: "utf-8"
  });
  return {
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    code: result.status
  };
}

module.exports = { resetDB, cli, TEST_DB };
