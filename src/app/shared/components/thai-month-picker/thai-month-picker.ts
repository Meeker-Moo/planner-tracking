import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, signal } from '@angular/core';
import { THAI_MONTHS } from '../../../core/models/status.constant';
import { daysInMonth, formatMonthYearThai, parseIsoDate, toIsoDate, todayIso } from '../../utils/date.util';

/**
 * Picks a month and a Buddhist year. The value is still a full yyyy-MM-dd date: the first day of the
 * chosen month for `edge="start"`, its last day for `edge="end"`.
 */
@Component({
  selector: 'app-thai-month-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative block',
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'close()',
  },
  template: `
    <button
      type="button"
      class="w-full flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-left outline-none focus:border-blue-500 bg-white"
      [attr.aria-label]="ariaLabel()"
      aria-haspopup="dialog"
      [attr.aria-expanded]="isOpen()"
      (click)="toggle()"
    >
      <span [class.text-slate-400]="!value()">{{ display() || placeholder() }}</span>
      <span aria-hidden="true" class="text-slate-400">📅</span>
    </button>

    @if (isOpen()) {
      <div
        role="dialog"
        [attr.aria-label]="ariaLabel()"
        class="absolute left-0 top-full mt-1 z-10 w-64 bg-white border border-slate-200 rounded-xl shadow-xl p-3"
      >
        <div class="flex items-center gap-1.5 mb-2">
          <button
            type="button"
            aria-label="ปีก่อนหน้า"
            class="w-8 h-8 rounded-lg text-slate-600 hover:bg-slate-100"
            (click)="shiftYear(-1)"
          >
            ‹
          </button>
          <select
            aria-label="ปี พ.ศ."
            class="flex-1 min-w-0 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center outline-none focus:border-blue-500"
            (change)="onYearChange($event)"
          >
            @for (y of yearOptions(); track y) {
              <option [value]="y" [selected]="y === viewYear()">{{ y + 543 }}</option>
            }
          </select>
          <button
            type="button"
            aria-label="ปีถัดไป"
            class="w-8 h-8 rounded-lg text-slate-600 hover:bg-slate-100"
            (click)="shiftYear(1)"
          >
            ›
          </button>
        </div>

        <div class="grid grid-cols-3 gap-1">
          @for (m of months; track $index) {
            <button
              type="button"
              class="h-9 rounded-lg text-sm"
              [class]="monthClass($index)"
              [attr.aria-pressed]="isSelected($index)"
              (click)="select($index)"
            >
              {{ m }}
            </button>
          }
        </div>

        <div class="mt-2 pt-2 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            class="px-2.5 py-1 rounded-lg text-sm font-semibold text-blue-600 hover:bg-blue-50"
            (click)="selectThisMonth()"
          >
            เดือนนี้
          </button>
        </div>
      </div>
    }
  `,
})
export class ThaiMonthPicker {
  /** ISO date, yyyy-MM-dd (Gregorian); the Buddhist year is display-only. */
  value = model('');
  edge = input<'start' | 'end'>('start');
  placeholder = input('เลือกเดือน / ปี');
  ariaLabel = input('เลือกเดือนและปี');

  readonly months = THAI_MONTHS;

  isOpen = signal(false);
  viewYear = signal(new Date().getFullYear());

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  display = computed(() => formatMonthYearThai(this.value()));

  private readonly selected = computed(() => parseIsoDate(this.value()));

  yearOptions = computed(() => {
    const center = this.viewYear();
    return Array.from({ length: 21 }, (_, i) => center - 10 + i);
  });

  toggle(): void {
    if (this.isOpen()) {
      this.close();
      return;
    }
    this.viewYear.set(this.selected()?.year ?? new Date().getFullYear());
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  shiftYear(delta: number): void {
    this.viewYear.update((y) => y + delta);
  }

  onYearChange(e: Event): void {
    this.viewYear.set(+(e.target as HTMLSelectElement).value);
  }

  isSelected(month: number): boolean {
    const s = this.selected();
    return !!s && s.year === this.viewYear() && s.month === month;
  }

  monthClass(month: number): string {
    return this.isSelected(month) ? 'bg-blue-600 text-white font-bold' : 'text-slate-700 hover:bg-slate-100';
  }

  select(month: number): void {
    this.pick(this.viewYear(), month);
  }

  selectThisMonth(): void {
    const today = parseIsoDate(todayIso())!;
    this.pick(today.year, today.month);
  }

  onDocumentClick(e: Event): void {
    if (this.isOpen() && !this.host.nativeElement.contains(e.target as Node)) this.close();
  }

  private pick(year: number, month: number): void {
    this.value.set(toIsoDate(year, month, this.edge() === 'end' ? daysInMonth(year, month) : 1));
    this.close();
  }
}
