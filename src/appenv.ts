import dotenv from 'dotenv';
import { VERSION } from './version';

dotenv.config({ override: true });

function setEnvIfNotSet(envVar: string, value: string) {
  /* eslint-disable no-process-env */
  if (!process.env[envVar]) {
    process.env[envVar] = value;
  }
  /* eslint-enable no-process-env */
}
setEnvIfNotSet('npm_package_version', VERSION);
setEnvIfNotSet('npm_package_name', 'natuin');
