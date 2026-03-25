export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(headers ?? {}),
    },
  });
}

export function error(message: string, status: number, code = 'ERROR', headers?: HeadersInit): Response {
  return json({ error: message, code }, status, headers);
}
