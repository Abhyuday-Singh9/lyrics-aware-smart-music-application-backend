const path = require("path");
const { all, get, run } = require("./database");
const {
  getLyricsPath,
  getSongFiles,
  hasLyrics,
  songsDir,
} = require("./mediaLibrary");

function getSongTitle(filename) {
  return path.parse(filename).name;
}

async function syncSongsFromDisk() {
  const songFiles = getSongFiles();

  if (songFiles.length > 0) {
    const placeholders = songFiles.map(() => "?").join(", ");
    await run(`DELETE FROM songs WHERE filename NOT IN (${placeholders})`, songFiles);
  } else {
    await run("DELETE FROM songs");
  }

  for (const filename of songFiles) {
    const audioPath = path.join(songsDir, filename);
    const lyricsPath = hasLyrics(filename) ? getLyricsPath(filename) : null;

    await run(
      `INSERT INTO songs (filename, title, audio_path, lyrics_path, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(filename) DO UPDATE SET
         title = excluded.title,
         audio_path = excluded.audio_path,
         lyrics_path = excluded.lyrics_path,
         updated_at = CURRENT_TIMESTAMP`,
      [filename, getSongTitle(filename), audioPath, lyricsPath],
    );
  }

  return songFiles;
}

function listSongFiles() {
  return all("SELECT filename FROM songs ORDER BY filename").then((rows) =>
    rows.map((row) => row.filename),
  );
}

function findSongByFilename(filename) {
  return get("SELECT * FROM songs WHERE filename = ?", [filename]);
}

async function requireSong(filename) {
  const song = await findSongByFilename(filename);

  if (!song) {
    const err = new Error("Song not found");
    err.statusCode = 404;
    throw err;
  }

  return song;
}

module.exports = {
  findSongByFilename,
  listSongFiles,
  requireSong,
  syncSongsFromDisk,
};
