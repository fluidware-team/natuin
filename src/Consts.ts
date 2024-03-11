import { EnvParse } from '@fluidware-it/saddlebag';
import path from 'path';

// NODE_MODE: set by the image builder, do not override
export const NODE_MODE = EnvParse.envString('NODE_MODE', '');
export const OPENAPI_VIEWER_PATH = EnvParse.envString('OPENAPI_VIEWER_PATH', '/docs');
export const OPENAPI_SPEC_FILE = path.join(__dirname, '..', 'openapi', 'atuin-openapi.yaml');
export const OPENAPI_VALIDATE_RESPONSE = EnvParse.envBool('OPENAPI_VALIDATE_RESPONSE', true);

export const USE_OTEL_METRIC_EXPORTER = EnvParse.envBool('USE_OTEL_METRIC_EXPORTER', true);
// PROMETHEUS_EXPORTER_PORT: used only if  USE_OTEL_METRIC_EXPORTER is false
export const PROMETHEUS_EXPORTER_PORT = EnvParse.envInt('PROMETHEUS_EXPORTER_PORT', 8181);

export const ATUIN_API_VERSION = '18.0.0';

export const ATUIN_KEY_PREFIX = EnvParse.envString('ATUIN_KEY_PREFIX', 'natuin');

export const PUBLIC_URL = EnvParse.envString('PUBLIC_URL', 'http://localhost:8080');
