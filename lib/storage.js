const fs = require("fs");
const path = require("path");

function saveSubmission(payload, projectRoot) {
  const logPath = path.join(projectRoot, "submissions.log");
  const line = `${new Date().toISOString()} | ${JSON.stringify(payload)}\n`;
  try {
    fs.appendFileSync(logPath, line);
    return true;
  } catch (err) {
    console.error("No se pudo escribir submissions.log (filesystem read-only en este entorno):", err.message);
    return false;
  }
}

module.exports = { saveSubmission };
