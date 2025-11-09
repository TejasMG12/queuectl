// config.js
const { getConfig, setConfig } = require('../db');

module.exports.set = (key, value) => {
  setConfig(key, value);
  console.log('Config updated:', key, '=', value);
};

module.exports.get = (key) => {
  if (key) {
    console.log(key, '=', getConfig(key));
    return;
  }
  // list all config rows
  const db = require('../db').db;
  const rows = db.prepare('SELECT key, value FROM config').all();
  rows.forEach(r => console.log(r.key, '=', r.value));
};
