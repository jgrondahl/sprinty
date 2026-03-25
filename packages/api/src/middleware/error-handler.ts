import { ZodError } from 'zod';
import { error } from '../utils/response';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class BadRequestError extends ApiError {
  constructor(message = 'Bad Request', code = 'BAD_REQUEST') {
    super(message, 400, code);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized', code = 'UNAUTHORIZED') {
    super(message, 401, code);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden', code = 'FORBIDDEN') {
    super(message, 403, code);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Not Found', code = 'NOT_FOUND') {
    super(message, 404, code);
  }
}

export function mapError(err: unknown): Response {
  if (err instanceof ApiError) {
    return error(err.message, err.status, err.code);
  }

  if (err instanceof ZodError) {
    return error('Validation failed', 400, 'VALIDATION_ERROR');
  }

  if (err instanceof SyntaxError) {
    return error('Malformed JSON body', 400, 'MALFORMED_JSON');
  }

  return error('Internal Server Error', 500, 'INTERNAL_ERROR');
}
