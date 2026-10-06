import { computed, inject, Injectable, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';

/** Admin's choice of whose projects and events to look at, shared by every page through the toolbar. */
@Injectable({ providedIn: 'root' })
export class DataScopeService {
  private readonly auth = inject(AuthService);
  private readonly selected = signal('all');

  /** 'all', or an account id: the items that account created or is assigned to. Always 'all' for a User. */
  readonly ownerFilter = computed(() => (this.auth.hasRole('ADMIN') ? this.selected() : 'all'));

  setOwnerFilter(value: string): void {
    this.selected.set(value || 'all');
  }
}
