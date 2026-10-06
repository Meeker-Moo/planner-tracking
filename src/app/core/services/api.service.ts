import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { AuthError, AuthErrorCode } from '../auth/user.model';

const CODES = new Set<AuthErrorCode>([
  'INVALID',
  'LOCKED',
  'INACTIVE',
  'FORBIDDEN',
  'NOT_FOUND',
  'USERNAME_TAKEN',
  'INVALID_USERNAME',
  'DISPLAY_NAME_REQUIRED',
  'LAST_SUPER_ADMIN',
  'WRONG_PASSWORD',
  'WEAK_PASSWORD',
  'SAME_PASSWORD',
  'UNAUTHENTICATED',
  'PASSWORD_CHANGE_REQUIRED',
  'CONFLICT',
  'BAD_REQUEST',
  'SERVER_ERROR',
]);

/**
 * The app's calls to its API (server/), on the same origin, with the session cookie. A refusal is thrown as an
 * AuthError carrying the API's `code` (NETWORK when the server could not be reached) and is also announced on
 * `failures`, so AuthService can react to a session that ended (UNAUTHENTICATED) wherever it happened.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly failures = new Subject<AuthError>();

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  delete<T = unknown>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  /** `path` is below /api, e.g. `/plans`. */
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`/api${path}`, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw this.fail(new AuthError('NETWORK'));
    }
    const data = await response.json().catch(() => null);
    if (response.ok) return data as T;
    const code = CODES.has(data?.code) ? (data.code as AuthErrorCode) : 'SERVER_ERROR';
    throw this.fail(new AuthError(code, typeof data?.lockedUntil === 'string' ? data.lockedUntil : undefined));
  }

  private fail(error: AuthError): AuthError {
    this.failures.next(error);
    return error;
  }
}
