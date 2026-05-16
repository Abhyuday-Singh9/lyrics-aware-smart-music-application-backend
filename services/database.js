const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const databaseDir = path.join(__dirname, "../database");
const databasePath = path.join(databaseDir, "music.db");
const schemaPath = path.join(databaseDir, "schema.sql");

fs.mkdirSync(databaseDir, { recursive: true });

const db = new sqlite3.Database(databasePath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function handleRun(err) {
      if (err) {
        reject(err);
        return;
      }

      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(rows);
    });
  });
}

function exec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });
}

async function initializeDatabase() {
  const schema = fs.readFileSync(schemaPath, "utf-8");
  await exec(schema);
  await ensurePlayHistoryColumns();
}

async function addColumnIfMissing(tableName, columnName, columnDefinition) {
  const columns = await all(`PRAGMA table_info(${tableName})`);
  const hasColumn = columns.some((column) => column.name === columnName);

  if (!hasColumn) {
    await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
  }
}

async function ensurePlayHistoryColumns() {
  await addColumnIfMissing(
    "play_history",
    "playback_started_at",
    "playback_started_at TEXT",
  );
  await addColumnIfMissing(
    "play_history",
    "playback_ended_at",
    "playback_ended_at TEXT",
  );
  await addColumnIfMissing(
    "play_history",
    "started_at_seconds",
    "started_at_seconds REAL NOT NULL DEFAULT 0",
  );
  await addColumnIfMissing(
    "play_history",
    "ended_at_seconds",
    "ended_at_seconds REAL",
  );
  await addColumnIfMissing(
    "play_history",
    "played_seconds",
    "played_seconds REAL NOT NULL DEFAULT 0",
  );
  await addColumnIfMissing("play_history", "section_type", "section_type TEXT");
  await addColumnIfMissing(
    "play_history",
    "section_start_seconds",
    "section_start_seconds REAL",
  );
  await addColumnIfMissing(
    "play_history",
    "section_end_seconds",
    "section_end_seconds REAL",
  );
}

module.exports = {
  all,
  databasePath,
  get,
  initializeDatabase,
  run,
};
