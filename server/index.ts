import { changePassword, login, logout, me, sessionUser } from './auth';
import { Env } from './env';
import { createEvent, deleteEvent, listEvents, updateEvent } from './events';
import { ApiError, checkOrigin, errorResponse, json } from './http';
import { createPlan, deletePlan, listPlans, planSummary, updatePlan } from './plans';
import { Context, match, Route } from './router';
import { createUser, listUsers, resetPassword, updateUser, userDirectory } from './users';

// The API under /api/*. Every other path is a file of the Angular app, served by the assets binding
// (wrangler.jsonc) without running this code.

const routes: Route[] = [
  { method: 'POST', path: '/api/auth/login', handler: login, public: true },
  { method: 'POST', path: '/api/auth/logout', handler: logout, public: true },
  { method: 'GET', path: '/api/auth/me', handler: me, beforePasswordChange: true },
  { method: 'POST', path: '/api/auth/change-password', handler: changePassword, beforePasswordChange: true },

  { method: 'GET', path: '/api/users', handler: listUsers },
  { method: 'GET', path: '/api/users/directory', handler: userDirectory },
  { method: 'POST', path: '/api/users', handler: createUser },
  { method: 'PATCH', path: '/api/users/:id', handler: updateUser },
  { method: 'POST', path: '/api/users/:id/reset-password', handler: resetPassword },

  { method: 'GET', path: '/api/plans', handler: listPlans },
  { method: 'GET', path: '/api/plans/summary', handler: planSummary },
  { method: 'POST', path: '/api/plans', handler: createPlan },
  { method: 'PUT', path: '/api/plans/:id', handler: updatePlan },
  { method: 'DELETE', path: '/api/plans/:id', handler: deletePlan },

  { method: 'GET', path: '/api/events', handler: listEvents },
  { method: 'POST', path: '/api/events', handler: createEvent },
  { method: 'PUT', path: '/api/events/:id', handler: updateEvent },
  { method: 'DELETE', path: '/api/events/:id', handler: deleteEvent },
];

async function handle(request: Request, env: Env, url: URL): Promise<Response> {
  const found = match(routes, request.method, url.pathname);
  if (found === 'not-found') throw new ApiError(404, 'NOT_FOUND');
  if (found === 'method-not-allowed') return json({ code: 'BAD_REQUEST', detail: 'Method not allowed' }, 405);
  const { route, params } = found;
  if (request.method !== 'GET') checkOrigin(request, url);

  const ctx: Context = { request, env, url, params, now: new Date().toISOString() };
  if (!route.public) {
    const session = await sessionUser(request, env.DB, ctx.now);
    if (!session) throw new ApiError(401, 'UNAUTHENTICATED');
    const { user, tokenHash } = session;
    if (user.must_change_password && !route.beforePasswordChange) throw new ApiError(403, 'PASSWORD_CHANGE_REQUIRED');
    Object.assign(ctx, { user, tokenHash, actor: { id: user.id, role: user.role, active: true } });
  }
  return route.handler(ctx);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await handle(request, env, url);
    } catch (error) {
      if (error instanceof ApiError) return errorResponse(error);
      console.error(error);
      return json({ code: 'SERVER_ERROR' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
