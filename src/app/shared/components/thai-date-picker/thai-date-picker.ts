import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, signal } from '@angular/core';
import { THAI_MONTHS_FULL, THAI_WEEKDAYS_SHORT } from '../../../core/models/status.constant';
import { formatDateThai, parseIsoDate, toIsoDate, todayIso } from '../../utils/date.util';

interface DayCell {
  day: number;
  iso: string;
}

@Component({
  selector: 'app-thai-date-picker',
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
        class="absolute left-0 top-full mt-1 z-10 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-3"
      >
        <div class="flex items-center gap-1.5 mb-2">
          <button
            type="button"
            aria-label="เดือนก่อนหน้า"
            class="w-8 h-8 rounded-lg text-slate-600 hover:bg-slate-100"
            (click)="shiftMonth(-1)"
          >
            ‹
          </button>
          <select
            aria-label="เดือน"
            class="flex-1 min-w-0 border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-blue-500"
            (change)="onMonthChange($event)"
          >
            @for (m of months; track $index) {
              <option [value]="$index" [selected]="$index === viewMonth()">{{ m }}</option>
            }
          </select>
          <select
            aria-label="ปี พ.ศ."
            class="w-22 border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-blue-500"
            (change)="onYearChange($event)"
          >
            @for (y of yearOptions(); track y) {
              <option [value]="y" [selected]="y === viewYear()">{{ y + 543 }}</option>
            }
          </select>
          <button
            type="button"
            aria-label="เดือนถัดไป"
            class="w-8 h-8 rounded-lg text-slate-600 hover:bg-slate-100"
            (click)="shiftMonth(1)"
          >
            ›
          </button>
        </div>

        <div class="grid grid-cols-7 text-center text-xs font-semibold text-slate-500 mb-1">
          @for (w of weekdays; track $index) {
            <span class="py-1">{{ w }}</span>
          }
        </div>

        <div class="grid grid-cols-7 gap-0.5">
          @for (n of leadingBlanks(); track $index) {
            <span></span>
          }
          @for (c of days(); track c.iso) {
            <button
              type="button"
              class="h-8 rounded-lg text-sm"
              [class]="dayClass(c.iso)"
              [attr.aria-label]="formatThai(c.iso)"
              [attr.aria-pressed]="c.iso === value()"
              (click)="select(c.iso)"
            >
              {{ c.day }}
            </button>
          }
        </div>

        <div class="mt-2 pt-2 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            class="px-2.5 py-1 rounded-lg text-sm font-semibold text-blue-600 hover:bg-blue-50"
            (click)="select(today)"
          >
            วันนี้
          </button>
        </div>
      </div>
    }
  `,
})
export class ThaiDatePicker {
  /** ISO date, yyyy-MM-dd (Gregorian). The Buddhist year is display-only. */
  value = model('');
  placeholder = input('เลือกวันที่');
  ariaLabel = input('เลือกวันที่');

  readonly months = THAI_MONTHS_FULL;
  readonly weekdays = THAI_WEEKDAYS_SHORT;
  readonly today = todayIso();
  readonly formatThai = formatDateThai;

  isOpen = signal(false);
  viewYear = signal(new Date().getFullYear());
  viewMonth = signal(new Date().getMonth());

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  display = computed(() => formatDateThai(this.value()));

  yearOptions = computed(() => {
    const center = this.viewYear();
    return Array.from({ length: 21 }, (_, i) => center - 10 + i);
  });

  leadingBlanks = computed(() => Array.from({ length: new Date(this.viewYear(), this.viewMonth(), 1).getDay() }));

  days = computed<DayCell[]>(() => {
    const year = this.viewYear();
    const month = this.viewMonth();
    const count = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: count }, (_, i) => ({ day: i + 1, iso: toIsoDate(year, month, i + 1) }));
  });

  dayClass(iso: string): string {
    if (iso === this.value()) return 'bg-blue-600 text-white font-bold';
    if (iso === this.today) return 'ring-1 ring-blue-400 hover:bg-slate-100';
    return 'hover:bg-slate-100';
  }

  toggle(): void {
    if (this.isOpen()) {
      this.close();
      return;
    }
    const p = parseIsoDate(this.value()) ?? parseIsoDate(this.today)!;
    this.viewYear.set(p.year);
    this.viewMonth.set(p.month);
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  shiftMonth(delta: number): void {
    const d = new Date(this.viewYear(), this.viewMonth() + delta, 1);
    this.viewYear.set(d.getFullYear());
    this.viewMonth.set(d.getMonth());
  }

  onMonthChange(e: Event): void {
    this.viewMonth.set(+(e.target as HTMLSelectElement).value);
  }

  onYearChange(e: Event): void {
    this.viewYear.set(+(e.target as HTMLSelectElement).value);
  }

  select(iso: string): void {
    this.value.set(iso);
    this.close();
  }

  onDocumentClick(e: Event): void {
    if (this.isOpen() && !this.host.nativeElement.contains(e.target as Node)) this.close();
  }
}
