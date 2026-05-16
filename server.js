const express = require("express");
const cors = require("cors");
const path = require("path");
const { initializeDatabase } = require("./services/database");
const { getGlobalSearchIndexStats, initializeGlobalSearchIndex } = require("./services/globalSearchService");
const { log } = require("./services/logger");
const { syncSongsFromDisk } = require("./services/songRepository");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/songs", express.static(path.join(__dirname, "./songs")));

app.use("/songs", require("./routes/songs"));
app.use("/lyrics", require("./routes/lyrics"));
app.use("/history", require("./routes/history"));
app.use("/library", require("./routes/library"));
app.use("/query", require("./routes/query"));
app.use("/search", require("./routes/search"));
app.use("/voice", require("./routes/voice"));

async function startServer() {
  await initializeDatabase();
  await syncSongsFromDisk();
  initializeGlobalSearchIndex();

  const searchIndexStats = getGlobalSearchIndexStats();
  log("INFO", "Global search index ready:", searchIndexStats);

  app.listen(5000, () => {
    log("INFO", "Server running on http://localhost:5000");
  });
}

startServer().catch((err) => {
  log("ERROR", "Failed to start server:", err);
  process.exit(1);
});
