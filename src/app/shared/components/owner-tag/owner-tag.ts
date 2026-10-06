import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { Owned } from '../../../core/auth/permissions';
import { UserStore } from '../../../core/auth/user-store.service';

/**
 * Whose project or event this is, from the signed-in account's point of view: nothing for its own,
 * "ได้รับมอบหมายจาก …" for a User's view of someone else's (it takes part in it), and the owner's name for Admin.
 */
@Component({
  selector: 'app-owner-tag',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (label(); as l) {
      <span
        class="inline-flex items-center gap-1 w-fit rounded-md text-[11px] font-semibold px-1.5 py-0.5 whitespace-nowrap"
        [class]="assigned() ? 'bg-violet-50 text-violet-700' : 'bg-slate-100 text-slate-600'"
        [title]="l"
      >
        <svg viewBox="0 0 20 20" class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="10" cy="7" r="3" />
          <path d="M4.5 16.5c.8-2.8 3-4.3 5.5-4.3s4.7 1.5 5.5 4.3" stroke-linecap="round" />
        </svg>
        {{ l }}
      </span>
    }
  `,
})
export class OwnerTag {
  item = input.required<Owned>();

  private readonly auth = inject(AuthService);
  private readonly users = inject(UserStore);

  /** Someone else's item that a User can see is one they take part in (assigned, or responsible for it or an activity). */
  readonly assigned = computed(() => {
    const me = this.auth.user();
    return !!me && me.role === 'USER' && this.item().ownerId !== me.id;
  });

  readonly label = computed(() => {
    const me = this.auth.user()?.id;
    const owner = this.item().ownerId;
    if (!me || owner === me) return '';
    const name = this.users.displayName(owner);
    return this.assigned() ? `ได้รับมอบหมายจาก ${name}` : name;
  });
}
