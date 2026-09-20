import { Injectable, computed, signal } from '@angular/core';
import { StorageService } from './storage.service';
import { Activity, WorkPlan, WorkPlanInput } from '../models/work-plan.model';
import { currentFiscalYear, withFiscalYear } from '../../shared/utils/date.util';
import { uid } from '../../shared/utils/id.util';

const STORAGE_KEY = 'awp:plans:v1';

@Injectable({ providedIn: 'root' })
export class WorkPlanService {
  private readonly plansSignal = signal<WorkPlan[]>([]);

  readonly plans = this.plansSignal.asReadonly();

  readonly years = computed(() => {
    const set = new Set(this.plansSignal().map((p) => p.year));
    set.add(currentFiscalYear());
    return Array.from(set).sort((a, b) => b - a);
  });

  constructor(private readonly storage: StorageService) {
    const loaded = this.storage.get<WorkPlan[]>(STORAGE_KEY);
    if (loaded) {
      // Data saved before fiscal years existed has the calendar year in `year`; recompute it from the start date.
      this.plansSignal.set(loaded.map(withFiscalYear));
    }
  }

  getById(id: string): WorkPlan | undefined {
    return this.plansSignal().find((p) => p.id === id);
  }

  add(input: WorkPlanInput): WorkPlan {
    const now = new Date().toISOString();
    const plan: WorkPlan = { ...input, id: uid(), createdAt: now, updatedAt: now };
    this.plansSignal.update((list) => [...list, plan]);
    this.persist();
    return plan;
  }

  update(id: string, input: WorkPlanInput): void {
    this.plansSignal.update((list) =>
      list.map((p) => (p.id === id ? { ...p, ...input, updatedAt: new Date().toISOString() } : p)),
    );
    this.persist();
  }

  delete(id: string): void {
    this.plansSignal.update((list) => list.filter((p) => p.id !== id));
    this.persist();
  }

  /** Adds the activity to the project, or replaces the one with the same id. */
  saveActivity(planId: string, activity: Activity): void {
    const plan = this.getById(planId);
    if (!plan) return;
    const activities = plan.activities ?? [];
    this.setActivities(
      planId,
      activities.some((a) => a.id === activity.id)
        ? activities.map((a) => (a.id === activity.id ? activity : a))
        : [...activities, activity],
    );
  }

  deleteActivity(planId: string, activityId: string): void {
    const plan = this.getById(planId);
    if (!plan) return;
    this.setActivities(
      planId,
      (plan.activities ?? []).filter((a) => a.id !== activityId),
    );
  }

  replaceAll(plans: WorkPlan[]): void {
    this.plansSignal.set(plans);
    this.persist();
  }

  mergeAll(plans: WorkPlan[]): void {
    this.plansSignal.update((list) => {
      const byId = new Map(list.map((p) => [p.id, p]));
      for (const p of plans) {
        byId.set(p.id, p);
      }
      return Array.from(byId.values());
    });
    this.persist();
  }

  private setActivities(planId: string, activities: Activity[]): void {
    this.plansSignal.update((list) =>
      list.map((p) =>
        p.id === planId
          ? { ...p, activities: activities.length ? activities : undefined, updatedAt: new Date().toISOString() }
          : p,
      ),
    );
    this.persist();
  }

  private persist(): void {
    this.storage.set(STORAGE_KEY, this.plansSignal());
  }
}
