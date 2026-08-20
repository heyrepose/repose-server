/**
 * Load repose-server/.env — the only local env file for the backend.
 * Scripts and dev tooling call this; Nest uses ConfigModule with envFilePath: '.env'.
 */
const fs = require('node:fs');
const path = require('node:path');

const ENV_PATH = path.join(__dirname, '..', '.env');

function loadEnv(options = {}) {
  const { override = false } = options;
  if (!fs.existsSync(ENV_PATH)) return false;

  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!override && process.env[key] !== undefined) continue;
    process.env[key] = value;
  }
  return true;
}

module.exports = { loadEnv, ENV_PATH };
