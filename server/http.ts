import { AuthErrorCode } from '../src/app/core/auth/user.model';

/** The `code` of an error body: the app's AuthError codes plus the ones only the API gives. */
export type ApiErrorCode =
  | AuthErrorCode
  | 'UNAUTHENTICATED'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'CONFLICT'
  | 'BAD_REQUEST'
  | 'SERVER_ERROR';

/** A refusal that becomes a JSON error response `{ code, ...extra }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    readonly extra?: Record<string, unknown>,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

export const forbidden = () => new ApiError(403, 'FORBIDDEN');
export const notFound = () => new ApiError(404, 'NOT_FOUND');
export const conflict = () => new ApiError(409, 'CONFLICT');
export const badRequest = (detail: string) => new ApiError(400, 'BAD_REQUEST', { detail });

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export function errorResponse(error: ApiError): Response {
  return json({ code: error.code, ...error.extra }, error.status);
}

/** The biggest request body accepted, in characters: a project with hundreds of activities fits easily. */
const MAX_BODY = 512 * 1024;

/** The request's JSON body; anything but a JSON object is a 400. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    throw badRequest('Content-Type must be application/json');
  }
  const text = await request.text();
  if (text.length > MAX_BODY) throw badRequest('Body too large');
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw badRequest('Invalid JSON');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Expected a JSON object');
  return body as Record<string, unknown>;
}

/**
 * A change made from another site is refused. The session cookie is SameSite=Strict already; this also covers
 * browsers that do not honour it. Requests without an Origin header (curl, same-origin GET) pass.
 */
export function checkOrigin(request: Request, url: URL): void {
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) throw forbidden();
}

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return null;
}

/** A Set-Cookie value; `maxAge` null makes a cookie that ends with the browser, 0 removes it. */
export function cookie(name: string, value: string, maxAge: number | null): string {
  const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict'];
  if (maxAge !== null) parts.push(`Max-Age=${maxAge}`);
  return parts.join('; ');
}
