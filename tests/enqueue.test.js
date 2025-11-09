const { resetDB, cli, TEST_DB } = require("./testUtils");
const sqlite3 = require("sqlite3");

beforeEach(resetDB);

test("enqueue adds a job to the database", done => {
    cli("enqueue", `{"id":"test1","command":"echo hello"}`);

    const db = new sqlite3.Database(TEST_DB);
    db.get("SELECT id, command, state FROM jobs WHERE id = 'test1';", (err, row) => {
        expect(row.id).toBe("test1");
        expect(row.command).toBe("echo hello");
        expect(row.state).toBe("pending");
        db.close();
        done();
    });
});
