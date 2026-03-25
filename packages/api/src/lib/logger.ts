import pino from 'pino';

const logLevel = process.env['LOG_LEVEL'] ?? (process.env['NODE_ENV'] === 'development' ? 'debug' : 'info');

export const logger = pino({
  level: logLevel,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'password',
      'pass',
      'passwd',
      'token',
      'accessToken',
      'refreshToken',
      'secret',
      'apiKey',
      'authorization',
      'headers.authorization',
      'user.password',
      'users[*].token',
    ],
    censor: '[Redacted]',
  },
});
