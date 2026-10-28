const fs = require('node:fs');
const path = require('node:path');

function recordStartupFailure(userDataDirectory, stage, error, occurredAt = new Date()) {
  const logPath = path.join(userDataDirectory, 'logs', 'startup.log');
  const record = {
    timestamp: occurredAt.toISOString(),
    stage,
    error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  };

  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, 'utf8');
    return logPath;
  } catch {
    return null;
  }
}

module.exports = { recordStartupFailure };
