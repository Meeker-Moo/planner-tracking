import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CalendarEvent } from '../models/calendar-event.model';
import { WorkPlan } from '../models/work-plan.model';
import { ApiService } from '../services/api.service';
import { EventService } from '../services/event.service';
import { WorkPlanService } from '../services/work-plan.service';
import { summarizeYear } from '../../features/dashboard/dashboard.util';
import { yearRange } from '../../shared/utils/date.util';
import { uid } from '../../shared/utils/id.util';
import { AuthService } from './auth.service';
import { canManageUsers, canUseProjects, canView, canViewPlan } from './permissions';
import { UserStore } from './user-store.service';
import { AppUser, AuthError, AuthErrorCode } from './user.model';

// For specs: an in-memory stand-in for the API (server/), shared by every "page" (TestBed) of a test, so one
// account's changes are what the next one loads. It answers like the API and checks who may see what, but it
// stores what it is sent: the server's own rules for changes are tested in server/*.spec.ts.

type TestUser = AppUser & { password: string };

export interface FakeBackend {
  users: TestUser[];
  plans: WorkPlan[];
  events: CalendarEvent[];
  /** The account of the session cookie. */
  session: string | null;
  requests: { method: string; path: string; body?: unknown }[];
}

function account(id: string, username: string, displayName: string, role: AppUser['role'], password: string): TestUser {
  return { id, username, displayName, role, password, active: true, mustChangePassword: false, createdBy: null, createdAt: '', updatedAt: '' };
}

/** The accounts of server/seed-dev.sql: u-superadmin, u-admin, u-user1, u-user2. */
function testUsers(): TestUser[] {
  return [
    account('u-superadmin', 'superadmin', 'Super Admin (dev)', 'SUPER_ADMIN', 'super1234'),
    account('u-admin', 'admin', 'Admin (dev)', 'ADMIN', 'admin1234'),
    account('u-user1', 'user1', 'ผู้ใช้ 1 (dev)', 'USER', 'user1234'),
    account('u-user2', 'user2', 'ผู้ใช้ 2 (dev)', 'USER', 'user1234'),
  ];
}

export let backend: FakeBackend = { users: testUsers(), plans: [], events: [], session: null, requests: [] };

/** An empty backend with the test accounts, once the last test's page has sent its changes; call it in beforeEach. */
export async function resetBackend(): Promise<FakeBackend> {
  await settle();
  backend = { users: testUsers(), plans: [], events: [], session: null, requests: [] };
  return backend;
}

let tick = 0;
/** A new `updatedAt`, different every time even under fake timers. */
function stamp(): string {
  return new Date(Date.now() + ++tick).toISOString();
}

function refuse(code: AuthErrorCode): never {
  throw new AuthError(code);
}

function publicUser({ password: _password, ...user }: TestUser): AppUser {
  return user;
}

@Injectable()
export class FakeApi extends ApiService {
  override async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    backend.requests.push({ method, path, body });
    try {
      return structuredClone(this.handle(method, path, (body ?? {}) as Record<string, any>)) as T;
    } catch (error) {
      if (error instanceof AuthError) this.failures.next(error);
      throw error;
    }
  }

  private actor(): TestUser {
    const user = backend.users.find((u) => u.id === backend.session && u.active);
    if (!user) refuse('UNAUTHENTICATED');
    return user;
  }

  private handle(method: string, fullPath: string, body: Record<string, any>): unknown {
    const [path, query] = fullPath.split('?');
    const [, area, id, action] = path.split('/');
    const route = `${method} /${area}${id ? (area === 'auth' ? `/${id}` : '/:id') : ''}${action ? `/${action}` : ''}`;

    if (route === 'POST /auth/login') {
      const user = backend.users.find((u) => u.username === String(body['username']).trim().toLowerCase());
      if (!user || user.password !== body['password']) refuse('INVALID');
      if (!user.active) refuse('INACTIVE');
      backend.session = user.id;
      return { user: publicUser(user) };
    }
    if (route === 'POST /auth/logout') {
      backend.session = null;
      return { ok: true };
    }
    if (route === 'GET /auth/me') {
      const user = backend.users.find((u) => u.id === backend.session && u.active);
      return { user: user ? publicUser(user) : null };
    }
    const actor = this.actor();
    if (route === 'POST /auth/change-password') {
      if (body['currentPassword'] !== actor.password) refuse('WRONG_PASSWORD');
      Object.assign(actor, { password: body['newPassword'], mustChangePassword: false });
      return { user: publicUser(actor) };
    }
    if (actor.mustChangePassword) refuse('PASSWORD_CHANGE_REQUIRED');

    if (area === 'users') return this.users(route, actor, id, body);
    if (!canUseProjects(actor)) refuse('FORBIDDEN');
    if (area === 'plans') return this.plans(route, actor, id, body, new URLSearchParams(query));
    if (area === 'events') return this.events(route, actor, id, body);
    return refuse('NOT_FOUND');
  }

  private users(route: string, actor: TestUser, id: string, body: Record<string, any>): unknown {
    if (route === 'GET /users/:id') {
      // /users/directory
      return { users: backend.users.filter((u) => u.role !== 'SUPER_ADMIN').map(({ id, displayName, role, active }) => ({ id, displayName, role, active })) };
    }
    if (!canManageUsers(actor)) refuse('FORBIDDEN');
    if (route === 'GET /users') return { users: backend.users.map(publicUser) };
    if (route === 'POST /users') {
      const user = account(uid(), body['username'], body['displayName'], body['role'], 'temp-pass');
      user.mustChangePassword = true;
      backend.users.push(user);
      return { user: publicUser(user), tempPassword: 'temp-pass' };
    }
    const target = backend.users.find((u) => u.id === id) ?? refuse('NOT_FOUND');
    if (route === 'PATCH /users/:id') {
      Object.assign(target, body);
      if (!target.active && backend.session === target.id) backend.session = null;
      return { user: publicUser(target) };
    }
    if (route === 'POST /users/:id/reset-password') {
      Object.assign(target, { password: 'temp-pass', mustChangePassword: true });
      if (backend.session === target.id) backend.session = null;
      return { tempPassword: 'temp-pass' };
    }
    return refuse('NOT_FOUND');
  }

  private plans(route: string, actor: TestUser, id: string, body: Record<string, any>, query: URLSearchParams): unknown {
    if (route === 'GET /plans') return { plans: backend.plans.filter((p) => canViewPlan(actor, p)) };
    if (route === 'GET /plans/:id') {
      // /plans/summary
      const year = Number(query.get('year'));
      return {
        years: yearRange(backend.plans.map((p) => p.year)),
        summary: summarizeYear(backend.plans, year, query.get('today') ?? ''),
      };
    }
    if (route === 'POST /plans') {
      const plan = { ...body, ownerId: actor.id, updatedAt: stamp() } as WorkPlan;
      backend.plans.push(plan);
      return { plan };
    }
    const index = backend.plans.findIndex((p) => p.id === id);
    if (index < 0) refuse('NOT_FOUND');
    if (!canViewPlan(actor, backend.plans[index])) refuse('FORBIDDEN');
    if (route === 'PUT /plans/:id') {
      if (body['updatedAt'] !== backend.plans[index].updatedAt) refuse('CONFLICT');
      backend.plans[index] = { ...body, updatedAt: stamp() } as WorkPlan;
      return { plan: backend.plans[index] };
    }
    if (route === 'DELETE /plans/:id') {
      backend.plans.splice(index, 1);
      return { ok: true };
    }
    return refuse('NOT_FOUND');
  }

  private events(route: string, actor: TestUser, id: string, body: Record<string, any>): unknown {
    if (route === 'GET /events') return { events: backend.events.filter((e) => canView(actor, e)) };
    if (route === 'POST /events') {
      const event = { ...body, ownerId: actor.id, updatedAt: stamp() } as CalendarEvent;
      backend.events.push(event);
      return { event };
    }
    const index = backend.events.findIndex((e) => e.id === id);
    if (index < 0) refuse('NOT_FOUND');
    if (!canView(actor, backend.events[index])) refuse('FORBIDDEN');
    if (route === 'PUT /events/:id') {
      if (body['updatedAt'] !== backend.events[index].updatedAt) refuse('CONFLICT');
      backend.events[index] = { ...body, updatedAt: stamp() } as CalendarEvent;
      return { event: backend.events[index] };
    }
    if (route === 'DELETE /events/:id') {
      backend.events.splice(index, 1);
      return { ok: true };
    }
    return refuse('NOT_FOUND');
  }
}

let open: { settled(): Promise<void> }[] = [];

/** Waits until the current page has sent every change it made to the backend. */
export async function settle(): Promise<void> {
  await Promise.all(open.map((s) => s.settled()));
}

/**
 * A fresh page (TestBed) on the shared backend, after the previous page's changes are sent: signed in as the
 * account (or signed out), with its accounts, projects and events loaded as at the app's start.
 */
export async function freshTestBed(userId: string | null): Promise<void> {
  await settle();
  TestBed.resetTestingModule();
  backend.session = userId;
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: '**', children: [] }]), { provide: ApiService, useClass: FakeApi }],
  });
  const stores = [TestBed.inject(UserStore), TestBed.inject(WorkPlanService), TestBed.inject(EventService)];
  open = stores.slice(1) as { settled(): Promise<void> }[];
  await TestBed.inject(AuthService).restore();
  await Promise.all(stores.map((s) => s.ready()));
}
