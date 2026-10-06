import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { UserStore } from '../../../core/auth/user-store.service';

/** The picker's value for a name typed in before responsible people were accounts; it is kept until changed. */
export const LEGACY_RESPONSIBLE = '__legacy__';

/** The picker value for saved data. */
export function responsibleValue(item: { responsibleId?: string; responsible?: string }): string {
  return item.responsibleId ?? (item.responsible?.trim() ? LEGACY_RESPONSIBLE : '');
}

/** A picker value as saved: the account and its name, the old name, or nobody. */
export function resolveResponsible(
  value: string,
  legacyName: string,
  nameOf: (id: string) => string | undefined,
): { responsibleId?: string; responsible: string } {
  if (value === LEGACY_RESPONSIBLE) return { responsible: legacyName };
  const name = value ? nameOf(value) : undefined;
  return name ? { responsibleId: value, responsible: name } : { responsible: '' };
}

/**
 * Picks the account responsible for a project or activity: an Admin or User account, or nobody.
 * Data saved before accounts existed has only a name; that name stays selectable so saving does not drop it.
 */
@Component({
  selector: 'app-responsible-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative">
      <select
        class="w-full appearance-none bg-white border border-slate-200 rounded-lg pl-3 pr-9 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100 disabled:text-slate-500"
        [attr.aria-label]="ariaLabel()"
        [disabled]="disabled()"
        (change)="valueChange.emit($any($event.target).value)"
      >
        <option value="" [selected]="value() === ''">— ไม่ระบุ —</option>
        @if (legacyName()) {
          <option [value]="legacy" [selected]="value() === legacy">{{ legacyName() }} (ข้อมูลเดิม ไม่ได้ผูกกับผู้ใช้)</option>
        }
        @for (u of options(); track u.id) {
          <option [value]="u.id" [selected]="value() === u.id">{{ u.displayName }}{{ u.active ? '' : ' (ปิดใช้งาน)' }}</option>
        }
      </select>
      <svg viewBox="0 0 20 20" class="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M6 8l4 4 4-4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </div>
    @if (disabled() && disabledHint()) {
      <span class="mt-1 block text-xs text-slate-500">{{ disabledHint() }}</span>
    }
  `,
})
export class ResponsiblePicker {
  /** An account id, '' for nobody, or LEGACY_RESPONSIBLE for `legacyName`. */
  value = input('');
  /** The name saved before accounts existed, if any. */
  legacyName = input('');
  disabled = input(false);
  disabledHint = input('');
  ariaLabel = input('ผู้รับผิดชอบ');

  valueChange = output<string>();

  readonly legacy = LEGACY_RESPONSIBLE;
  private readonly store = inject(UserStore);

  /** Active Admin and User accounts by name, plus the chosen one even if it has been deactivated. */
  readonly options = computed(() =>
    this.store
      .users()
      .filter((u) => u.role !== 'SUPER_ADMIN' && (u.active || u.id === this.value()))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'th')),
  );
}
