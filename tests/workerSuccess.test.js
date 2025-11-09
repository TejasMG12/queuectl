const { resetDB, cli, TEST_DB } = require("./testUtils");
const sqlite3 = require("sqlite3");

beforeEach(resetDB);

test("worker executes job and marks success", done => {

    cli("enqueue", `{"id":"job-ok","command":"echo ok"}`);
    
    // Run worker once
    cli("worker", "once");

    const db = new sqlite3.Database(TEST_DB);
    db.get(`SELECT state FROM jobs WHERE id='job-ok';`, (err, row) => {
        if(err){
            console.error(err);
            return done(err);
        }
        expect(row.state).toBe("completed");
        db.close();
        done();
    });
});
