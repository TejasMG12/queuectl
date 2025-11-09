const { resetDB, cli, TEST_DB } = require("./testUtils");
const sqlite3 = require("sqlite3");

beforeEach(resetDB);

test("failed job retries and moves to DLQ", done => {
    cli("enqueue", `{"id":"bad","command":"not_a_real_cmd"}`);

    // Simulate retries until max_retries is exceeded
    cli("worker", "once");
    cli("worker", "once");
    cli("worker", "once");
    cli("worker", "once");


    const db = new sqlite3.Database(TEST_DB);
    db.get(`SELECT * FROM jobs WHERE id='bad';`, (err, row) => {
        if(err){
            console.error(err);
            return done(err);
        }
        expect(row.state).toBe("dead");
        expect(row.attempts >= row.max_retries).toBe(true);
        db.close();
        done();
    });
}, 32000);
