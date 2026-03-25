import { json } from '../utils/response';

export function getHealth(): Response {
  return json({
    status: 'ok',
    version: '0.1.0',
    uptime: process.uptime(),
  });
}
