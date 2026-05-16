const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

function resolveCurrentVoskModelPath() {
  const configuredPath = process.env.VOSK_MODEL_PATH;
  if (configuredPath) {
    return configuredPath;
  }

  const modelsDirectory = path.join(__dirname, "..", "models");
  if (!fs.existsSync(modelsDirectory)) {
    return null;
  }

  const availableModels = fs
    .readdirSync(modelsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("vosk-model"))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));

  if (!availableModels.length) {
    return null;
  }

  return path.join(modelsDirectory, availableModels[0]);
}

function recognizeVoice(filePath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return reject(new Error("Audio file not found"));
    }

    const pythonBinary = process.env.PYTHON_BIN || "python";
    const scriptPath = path.join(__dirname, "..", "voice.py");
    const modelPath = resolveCurrentVoskModelPath();

    if (!modelPath) {
      return reject(new Error("No Vosk model found in backend/models"));
    }

    const child = spawn(pythonBinary, [scriptPath, filePath], {
      cwd: path.join(__dirname, ".."),
      env: {
        ...process.env,
        VOSK_MODEL_PATH: modelPath,
      },
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      reject(new Error("Python execution failed: " + error.message));
    });

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Voice recognition timeout"));
    }, 20000);

    child.on("close", (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        return reject(
          new Error(stderr.trim() || `Voice failed with code ${code}`),
        );
      }

      resolve(stdout.trim());
    });
  });
}

module.exports = { recognizeVoice };
