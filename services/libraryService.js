const { all, get, run } = require("./database");
const { requireSong } = require("./songRepository");

function rowToPlaylistMap(rows) {
  return rows.reduce((playlists, row) => {
    if (!playlists[row.name]) {
      playlists[row.name] = [];
    }

    if (row.filename) {
      playlists[row.name].push(row.filename);
    }

    return playlists;
  }, {});
}

async function getLibraryState() {
  const [favoriteRows, historyRows, playlistRows] = await Promise.all([
    all(`
      SELECT songs.filename
      FROM favorites
      JOIN songs ON songs.id = favorites.song_id
      ORDER BY favorites.created_at DESC
    `),
    all(`
      SELECT songs.filename
      FROM play_history
      JOIN songs ON songs.id = play_history.song_id
      ORDER BY play_history.played_at DESC
      LIMIT 50
    `),
    all(`
      SELECT playlists.name, songs.filename
      FROM playlists
      LEFT JOIN playlist_songs ON playlist_songs.playlist_id = playlists.id
      LEFT JOIN songs ON songs.id = playlist_songs.song_id
      ORDER BY playlists.name, playlist_songs.position, playlist_songs.added_at
    `),
  ]);

  return {
    favorites: favoriteRows.map((row) => row.filename),
    recentSongs: [...new Set(historyRows.map((row) => row.filename))],
    playlists: rowToPlaylistMap(playlistRows),
  };
}

async function addFavorite(filename) {
  const song = await requireSong(filename);
  await run("INSERT OR IGNORE INTO favorites (song_id) VALUES (?)", [song.id]);
}

async function removeFavorite(filename) {
  const song = await requireSong(filename);
  await run("DELETE FROM favorites WHERE song_id = ?", [song.id]);
}

async function createPlaylist(name) {
  const trimmedName = name.trim();

  if (!trimmedName) {
    const err = new Error("Playlist name required");
    err.statusCode = 400;
    throw err;
  }

  await run("INSERT OR IGNORE INTO playlists (name) VALUES (?)", [trimmedName]);
  return get("SELECT * FROM playlists WHERE name = ?", [trimmedName]);
}

async function deletePlaylist(name) {
  const trimmedName = name.trim();

  if (!trimmedName) {
    const err = new Error("Playlist name required");
    err.statusCode = 400;
    throw err;
  }

  await run("DELETE FROM playlists WHERE name = ?", [trimmedName]);
}

async function addSongToPlaylist(playlistName, filename) {
  const [playlist, song] = await Promise.all([
    createPlaylist(playlistName),
    requireSong(filename),
  ]);

  const maxPosition = await get(
    "SELECT COALESCE(MAX(position), -1) AS position FROM playlist_songs WHERE playlist_id = ?",
    [playlist.id],
  );

  await run(
    `INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position)
     VALUES (?, ?, ?)`,
    [playlist.id, song.id, maxPosition.position + 1],
  );
}

async function removeSongFromPlaylist(playlistName, filename) {
  const playlist = await get("SELECT * FROM playlists WHERE name = ?", [
    playlistName,
  ]);

  if (!playlist) return;

  const song = await requireSong(filename);

  await run(
    "DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?",
    [playlist.id, song.id],
  );
}

module.exports = {
  addFavorite,
  addSongToPlaylist,
  createPlaylist,
  deletePlaylist,
  getLibraryState,
  removeFavorite,
  removeSongFromPlaylist,
};
