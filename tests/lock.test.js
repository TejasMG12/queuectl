const { resetDB, cli, TEST_DB } = require("./testUtils");
const sqlite3 = require("sqlite3");

beforeEach(resetDB);

test("workers do not double-execute same job", done => {
    cli("enqueue", `{"id":"lock-test","command":"echo run"}`);

    // Two workers running simultaneously
    cli("worker", "once");
    cli("worker", "once");

    const db = new sqlite3.Database(TEST_DB);
    db.get(`SELECT state FROM jobs WHERE id='lock-test';`, (err, row) => {
        if (err) {
            console.error(err);
            return done(err);
        }
        expect(row.state).toBe("completed");
        db.close();
        done();
    });
}, 30000);
