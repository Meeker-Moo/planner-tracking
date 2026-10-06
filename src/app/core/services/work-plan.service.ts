import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { DataScopeService } from './data-scope.service';
import { planBelongsTo } from './owned-records';
import { RecordSync } from './record-sync';
import { SessionLoader } from './session-loader';
import { Activity, WorkPlan, WorkPlanInput } from '../models/work-plan.model';
import { AuthService } from '../auth/auth.service';
import { canEditPlan, canManageActivities, canSetActivityStatus, canSetPlanStatus, canUseProjects, canViewPlan } from '../auth/permissions';
import { UserStore } from '../auth/user-store.service';
import { AuthError, authErrorMessage } from '../auth/user.model';
import { YearSummary } from '../../features/dashboard/dashboard.util';
import { todayIso, withFiscalYear, yearRange } from '../../shared/utils/date.util';
import { uid } from '../../shared/utils/id.util';

/** The Dashboard's overview of a fiscal year (GET /api/plans/summary). */
export interface PlanSummary {
  /** Every fiscal year from the earliest project of anyone's to the latest (and the current year), newest first. */
  years: number[];
  summary: YearSummary;
}

/** Tells the person why a change was not saved, unless they were signed out (AuthService takes care of that). */
export function reportSaveError(error: unknown): void {
  if (error instanceof AuthError && (error.code === 'UNAUTHENTICATED' || error.code === 'PASSWORD_CHANGE_REQUIRED')) return;
  alert(error instanceof AuthError && error.code === 'CONFLICT' ? authErrorMessage(error) : `บันทึกไม่สำเร็จ: ${authErrorMessage(error)}`);
}

/**
 * The projects the signed-in account may see (permissions.ts), loaded from the API (server/plans.ts): its own, the
 * ones it is responsible for, and the ones where it is responsible for an activity — or all of them for Admin.
 * `plans` narrows Admin's to the person filter. The Dashboard's overview of everyone's projects is `summary()`.
 *
 * A change shows at once and is then sent to the API, which applies the same rules again and answers with the
 * stored project; when it refuses (or someone else saved first), the person is told and the projects are reloaded.
 *
 * Changes are checked here too: the owner and Admin may change anything; the account responsible for (assigned)
 * a project its status and its activities, but not its details, and it may not delete it; the account responsible
 * for an activity only that activity's status, note and ticked to-dos. Anything more is dropped. The `responsible` names of projects and activities
 * linked to an account follow that account's current name.
 */
@Injectable({ providedIn: 'root' })
export class WorkPlanService {
  private readonly auth = inject(AuthService);
  private readonly scope = inject(DataScopeService);
  private readonly users = inject(UserStore);
  private readonly api = inject(ApiService);
  private readonly plansSignal = signal<WorkPlan[]>([]);

  private readonly sync = new RecordSync<WorkPlan>({
    current: (id) => this.find(id),
    send: async (plan, version) => {
      const { plan: saved } = version
        ? await this.api.put<{ plan: WorkPlan }>(`/plans/${encodeURIComponent(plan.id)}`, { ...plan, updatedAt: version })
        : await this.api.post<{ plan: WorkPlan }>('/plans', plan);
      return saved;
    },
    sendDelete: (id) => this.api.delete(`/plans/${encodeURIComponent(id)}`),
    saved: (plan) => this.plansSignal.update((list) => list.map((p) => (p.id === plan.id ? plan : p))),
    failed: (error) => {
      reportSaveError(error);
      void this.loader.reload();
    },
  });

  private readonly loader = new SessionLoader(
    () => {
      const user = this.auth.user();
      return user && !user.mustChangePassword && canUseProjects(user) ? `${user.id}:${user.role}` : null;
    },
    async (isCurrent) => {
      const { plans } = await this.api.get<{ plans: WorkPlan[] }>('/plans');
      if (!isCurrent()) return;
      this.sync.loaded(plans);
      this.plansSignal.set(plans);
    },
    () => this.plansSignal.set([]),
  );

  readonly plans = computed(() => {
    const user = this.auth.user();
    const owner = this.scope.ownerFilter();
    return this.plansSignal()
      .filter((p) => canViewPlan(user, p) && (owner === 'all' || planBelongsTo(p, owner)))
      .map((p) => this.withNames(p));
  });

  /** The fiscal years of `plans` (see yearRange). */
  readonly years = computed(() => yearRange(this.plans().map((p) => p.year)));

  /** The fiscal years that have at least one project, newest first. */
  readonly yearsWithPlans = computed(() =>
    Array.from(new Set(this.plans().map((p) => p.year))).sort((a, b) => b - a),
  );

  /** Resolves once the projects of the signed-in account are loaded. */
  ready(): Promise<void> {
    return this.loader.ready();
  }

  /** Resolves once every change made so far has been sent. */
  settled(): Promise<void> {
    return this.sync.settled();
  }

  /** The Dashboard's overview of every project of the fiscal year, the same for Admin and User. */
  summary(year: number): Promise<PlanSummary> {
    return this.api.get<PlanSummary>(`/plans/summary?year=${year}&today=${todayIso()}`);
  }

  /** The project, if the signed-in account may see it (Admin's person filter does not apply). */
  getById(id: string): WorkPlan | undefined {
    const plan = this.find(id);
    return plan && canViewPlan(this.auth.user(), plan) ? this.withNames(plan) : undefined;
  }

  add(input: WorkPlanInput): WorkPlan {
    const now = new Date().toISOString();
    const plan: WorkPlan = withFiscalYear({
      ...input,
      ...this.responsible(input),
      id: uid(),
      ownerId: this.auth.user()?.id,
      statusUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    this.plansSignal.update((list) => [...list, plan]);
    this.sync.save(plan.id);
    return plan;
  }

  /** Edits the project (its owner never changes); the account responsible for it changes only the status. */
  update(id: string, input: WorkPlanInput): void {
    const plan = this.find(id);
    const user = this.auth.user();
    if (!plan) return;
    let changes: Partial<WorkPlan>;
    if (canEditPlan(user, plan)) changes = { ...input, ...this.responsible(input) };
    else if (canSetPlanStatus(user, plan)) changes = { status: input.status };
    else return;
    const now = new Date().toISOString();
    const statusUpdatedAt = changes.status !== undefined && changes.status !== plan.status ? now : plan.statusUpdatedAt;
    this.plansSignal.update((list) =>
      list.map((p) => (p.id === id ? withFiscalYear({ ...p, ...changes, ownerId: plan.ownerId, statusUpdatedAt, updatedAt: now }) : p)),
    );
    this.sync.save(id);
  }

  /** Only the owner and Admin may delete a project. */
  delete(id: string): void {
    const plan = this.find(id);
    if (!plan || !canEditPlan(this.auth.user(), plan)) return;
    this.plansSignal.update((list) => list.filter((p) => p.id !== id));
    this.sync.delete(id);
  }

  /**
   * Adds the activity to the project, or replaces the one with the same id. Someone who may only set its
   * status (responsible for the activity alone) gets the status, the note and the ticks of its existing
   * to-dos saved, nothing else.
   */
  saveActivity(planId: string, activity: Activity): void {
    const plan = this.getById(planId);
    const user = this.auth.user();
    if (!plan) return;
    const activities = plan.activities ?? [];
    const existing = activities.find((a) => a.id === activity.id);

    let saved: Activity;
    if (canManageActivities(user, plan)) {
      saved = { ...activity, ...this.activityResponsible(activity) };
    } else if (existing && canSetActivityStatus(user, plan, existing)) {
      const ticks = new Map((activity.todos ?? []).map((t) => [t.id, t.done]));
      saved = {
        ...existing,
        status: activity.status,
        note: activity.note,
        todos: existing.todos?.map((t) => ({ ...t, done: ticks.get(t.id) ?? t.done })),
      };
    } else {
      return;
    }
    saved = {
      ...saved,
      statusUpdatedAt: existing?.status === saved.status ? existing.statusUpdatedAt : new Date().toISOString(),
    };
    this.setActivities(planId, existing ? activities.map((a) => (a.id === activity.id ? saved : a)) : [...activities, saved]);
  }

  /** The owner, Admin and the account responsible for the project may remove an activity. */
  deleteActivity(planId: string, activityId: string): void {
    const plan = this.getById(planId);
    if (!plan || !canManageActivities(this.auth.user(), plan)) return;
    this.setActivities(
      planId,
      (plan.activities ?? []).filter((a) => a.id !== activityId),
    );
  }

  private find(id: string): WorkPlan | undefined {
    return this.plansSignal().find((p) => p.id === id);
  }

  /** The responsible account if it can be one (Admin or User) and its name; otherwise the typed-in name alone. */
  private responsible(item: { responsibleId?: string; responsible?: string }): { responsibleId?: string; responsible: string } {
    const user = this.users.getById(item.responsibleId);
    return user && user.role !== 'SUPER_ADMIN'
      ? { responsibleId: user.id, responsible: user.displayName }
      : { responsibleId: undefined, responsible: item.responsible ?? '' };
  }

  private activityResponsible(activity: Activity): Pick<Activity, 'responsibleId' | 'responsible'> {
    const { responsibleId, responsible } = this.responsible(activity);
    return { responsibleId, responsible: responsible || undefined };
  }

  /** The project with the current names of the accounts responsible for it and its activities. */
  private withNames(plan: WorkPlan): WorkPlan {
    const name = (id: string | undefined) => (id ? this.users.getById(id)?.displayName : undefined);
    const activities = plan.activities?.map((a) => {
      const current = name(a.responsibleId);
      return current && current !== a.responsible ? { ...a, responsible: current } : a;
    });
    const responsible = name(plan.responsibleId) ?? plan.responsible;
    const changed = responsible !== plan.responsible || activities?.some((a, i) => a !== plan.activities![i]);
    return changed ? { ...plan, responsible, activities } : plan;
  }

  private setActivities(planId: string, activities: Activity[]): void {
    this.plansSignal.update((list) =>
      list.map((p) =>
        p.id === planId
          ? { ...p, activities: activities.length ? activities : undefined, updatedAt: new Date().toISOString() }
          : p,
      ),
    );
    this.sync.save(planId);
  }
}
