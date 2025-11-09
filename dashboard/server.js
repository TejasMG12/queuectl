const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");

const expressLayouts = require("express-ejs-layouts");

const { createJob, getJobCounts, listJobsByState, setWorkersStopped, areWorkersStopped } = require("../db");
const workerStart = require("../commands/worker").start;
const workerStop = require("../commands/worker").stop;

const app = express();
app.use(expressLayouts);
app.set("layout", "layout");
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    const counts = getJobCounts();
    res.render("index", { counts, workersStopped: areWorkersStopped() });
});

app.post("/enqueue", (req, res) => {
    const { id, command, max_retries } = req.body;
    createJob({
        id,
        command,
        max_retries: parseInt(max_retries || 3, 10),
    });
    res.redirect("/");
});

app.post("/worker/start", (req, res) => {
    setWorkersStopped(false);
    workerStart();
    res.redirect("/");
});

app.post("/worker/stop", (req, res) => {
    setWorkersStopped(true);
    workerStop();
    res.redirect("/");
});

app.get("/jobs/:state", (req, res) => {
    const { state } = req.params;
    const jobs = listJobsByState(state);
    res.render("jobs", { state, jobs });
});

// Worker Controls
app.post('/worker/start', async (req, res) => {
  const { count, id } = req.body;
  const worker = require('../commands/worker');
  await worker.start({ count, id });
  res.redirect('/');
});

app.post('/worker/once', async (req, res) => {
  const worker = require('../commands/worker');
  await worker.runOnce({});
  res.redirect('/');
});

// Job lists
app.get('/jobs/:state', async (req, res) => {
  const state = req.params.state;
  const { getJobsByState } = require('../db');
  const jobs = await getJobsByState(state);
  res.render('jobs', { state, jobs });
});

// DLQ Actions
app.get('/dlq', async (req, res) => {
  const dlq = require('../commands/dlq');
  const jobs = await dlq.list({ returnOnly: true });
  res.render('dlq', { jobs });
});

app.post('/dlq/retry', async (req, res) => {
  const dlq = require('../commands/dlq');
  await dlq.retry(req.body.id);
  res.redirect('/dlq');
});


const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Dashboard running on http://localhost:${PORT}`));
