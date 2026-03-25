import { createServerFromEnv } from './server';
import { logger } from './lib/logger';

const server = createServerFromEnv();

logger.info({ port: server.port }, 'api_listening');
