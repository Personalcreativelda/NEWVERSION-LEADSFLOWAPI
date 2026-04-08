import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const apiEnvPath = path.join(__dirname, '..', '.env');
const rootEnvPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(apiEnvPath)) {
  dotenv.config({ path: apiEnvPath });
  console.log('[Config] Loaded env from', apiEnvPath);
} else {
  console.warn('[Config] api/.env not found at', apiEnvPath);
}

if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
  console.log('[Config] Loaded env from', rootEnvPath);
} else {
  console.warn('[Config] root .env not found at', rootEnvPath);
}
