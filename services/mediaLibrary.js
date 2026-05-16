const fs = require("fs");
const path = require("path");

const songsDir = path.join(__dirname, "../songs");
const lyricsDir = path.join(__dirname, "../lyrics");

function getSongFiles() {
  if (!fs.existsSync(songsDir)) {
    return [];
  }

  return fs.readdirSync(songsDir).filter((file) => file.endsWith(".mp3"));
}

function getLyricsFileName(songName) {
  return `${path.parse(songName).name}.lrc`;
}

function hasSong(songName) {
  return getSongFiles().includes(songName);
}

function getLyricsPath(songName) {
  return path.join(lyricsDir, getLyricsFileName(songName));
}

function hasLyrics(songName) {
  return hasSong(songName) && fs.existsSync(getLyricsPath(songName));
}

function readLyricsText(songName) {
  return fs.readFileSync(getLyricsPath(songName), "utf-8");
}

module.exports = {
  getLyricsFileName,
  getLyricsPath,
  getSongFiles,
  hasSong,
  hasLyrics,
  lyricsDir,
  readLyricsText,
  songsDir,
};
