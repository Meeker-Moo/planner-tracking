import { Actor } from '../src/app/core/auth/permissions';
import { UserRow } from './db';
import { Env } from './env';

export interface Context {
  request: Request;
  env: Env;
  url: URL;
  /** The `:name` parts of the matched path. */
  params: Record<string, string>;
  /** The time of the request (ISO), used for every timestamp it writes. */
  now: string;
  /** The signed-in account; set for every route except the public ones. */
  user?: UserRow;
  /** The same account as the permission rules take it. */
  actor?: Actor;
  tokenHash?: string;
}

export type Handler = (ctx: Context) => Promise<Response>;

export interface Route {
  method: string;
  /** e.g. /api/plans/:id */
  path: string;
  handler: Handler;
  /** Login and logout: no session needed. */
  public?: boolean;
  /** Reachable by an account that still has to change its one-time password. */
  beforePasswordChange?: boolean;
}

/** The route for a request and its path parameters, or why there is none (404, or 405 for a known path). */
export function match(
  routes: Route[],
  method: string,
  pathname: string,
): { route: Route; params: Record<string, string> } | 'not-found' | 'method-not-allowed' {
  const parts = pathname.replace(/\/+$/, '').split('/');
  let pathMatched = false;
  for (const route of routes) {
    const pattern = route.path.split('/');
    if (pattern.length !== parts.length) continue;
    const params: Record<string, string> = {};
    const ok = pattern.every((p, i) => {
      if (p.startsWith(':')) {
        params[p.slice(1)] = decodeURIComponent(parts[i]);
        return parts[i] !== '';
      }
      return p === parts[i];
    });
    if (!ok) continue;
    pathMatched = true;
    if (route.method === method) return { route, params };
  }
  return pathMatched ? 'method-not-allowed' : 'not-found';
}
