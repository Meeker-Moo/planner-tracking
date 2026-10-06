import { inject, Injectable } from '@angular/core';
import { UserStore } from '../auth/user-store.service';
import { EventService } from './event.service';
import { WorkPlanService } from './work-plan.service';

/** The signed-in account's accounts, projects and events, which load by themselves at every sign-in (SessionLoader). */
@Injectable({ providedIn: 'root' })
export class SessionData {
  private readonly stores = [inject(UserStore), inject(WorkPlanService), inject(EventService)];

  /** Resolves once they are loaded, so the next page opens with them (the app's start, after signing in). */
  async ready(): Promise<void> {
    await Promise.all(this.stores.map((s) => s.ready()));
  }
}
