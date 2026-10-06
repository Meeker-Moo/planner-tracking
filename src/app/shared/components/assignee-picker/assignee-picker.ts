import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { UserStore } from '../../../core/auth/user-store.service';

/**
 * Picks the USER accounts a project or event is assigned to (they may then see and edit it).
 * The owner is left out, and so are deactivated accounts unless they are already picked.
 */
@Component({
  selector: 'app-assignee-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-1.5">
      <span class="text-sm font-semibold text-slate-700">ผู้ได้รับมอบหมาย</span>
      @if (options().length === 0) {
        <p class="text-xs text-slate-500">ยังไม่มีบัญชีผู้ใช้ (User) ให้มอบหมาย</p>
      } @else {
        <div class="flex flex-wrap gap-2" role="group" aria-label="ผู้ได้รับมอบหมาย">
          @for (u of options(); track u.id) {
            <label
              class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm select-none"
              [class]="isPicked(u.id) ? 'border-blue-500 bg-blue-50 text-blue-800 font-semibold' : 'border-slate-200 text-slate-600'"
              [class.opacity-50]="disabled()"
              [class.cursor-pointer]="!disabled()"
            >
              <input
                type="checkbox"
                class="w-3.5 h-3.5 accent-blue-600"
                [checked]="isPicked(u.id)"
                [disabled]="disabled()"
                (change)="toggle(u.id)"
              />
              {{ u.displayName }}
              @if (!u.active) {
                <span class="text-[11px] text-slate-400">(ปิดใช้งาน)</span>
              }
            </label>
          }
        </div>
      }
      @if (disabled()) {
        <span class="text-xs text-slate-500">เฉพาะผู้สร้างหรือ Admin เท่านั้นที่เปลี่ยนผู้ได้รับมอบหมายได้</span>
      }
    </div>
  `,
})
export class AssigneePicker {
  value = input<string[]>([]);
  ownerId = input<string | undefined>(undefined);
  disabled = input(false);

  valueChange = output<string[]>();

  private readonly store = inject(UserStore);

  readonly options = computed(() =>
    this.store
      .users()
      .filter((u) => u.role === 'USER' && u.id !== this.ownerId() && (u.active || this.value().includes(u.id)))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'th')),
  );

  isPicked(id: string): boolean {
    return this.value().includes(id);
  }

  toggle(id: string): void {
    if (this.disabled()) return;
    this.valueChange.emit(this.isPicked(id) ? this.value().filter((v) => v !== id) : [...this.value(), id]);
  }
}
