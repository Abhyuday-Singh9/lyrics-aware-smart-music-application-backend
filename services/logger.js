function log(type, ...args) {
  const level = type === "ERROR" ? "ERROR" : "INFO";
  const timestamp = new Date().toISOString();
  const logger = level === "ERROR" ? console.error : console.log;

  logger(`[${timestamp}] [${level}]`, ...args);
}

module.exports = { log };
