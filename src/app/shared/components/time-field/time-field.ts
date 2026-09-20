import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

const pad = (n: number) => n.toString().padStart(2, '0');

/**
 * A time of day in 24-hour form (HH:mm). Built from two selects rather than the browser's own time
 * input, because that one shows AM/PM or 24 hours depending on the machine's settings.
 */
@Component({
  selector: 'app-time-field',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex items-center gap-1 border rounded-lg px-2.5 py-1.5 bg-white focus-within:border-blue-500"
      [class]="invalid() ? 'border-red-400' : 'border-slate-200'"
    >
      <select
        class="bg-transparent outline-none text-sm py-1 tabular-nums"
        [attr.aria-label]="ariaLabel() + ' ชั่วโมง'"
        (change)="onHour($event)"
      >
        @for (h of hours; track h) {
          <option [value]="h" [selected]="h === hour()">{{ h }}</option>
        }
      </select>
      <span class="text-sm font-semibold text-slate-500" aria-hidden="true">:</span>
      <select
        class="bg-transparent outline-none text-sm py-1 tabular-nums"
        [attr.aria-label]="ariaLabel() + ' นาที'"
        (change)="onMinute($event)"
      >
        @for (m of minutes; track m) {
          <option [value]="m" [selected]="m === minute()">{{ m }}</option>
        }
      </select>
      <span class="ml-1 text-sm text-slate-500">น.</span>
    </div>
  `,
})
export class TimeField {
  /** HH:mm, 24-hour. */
  value = model('');
  ariaLabel = input('เวลา');
  invalid = input(false);

  readonly hours = Array.from({ length: 24 }, (_, i) => pad(i));
  readonly minutes = Array.from({ length: 60 }, (_, i) => pad(i));

  hour = computed(() => this.part(0));
  minute = computed(() => this.part(1));

  onHour(event: Event): void {
    this.value.set(`${(event.target as HTMLSelectElement).value}:${this.minute()}`);
  }

  onMinute(event: Event): void {
    this.value.set(`${this.hour()}:${(event.target as HTMLSelectElement).value}`);
  }

  // A value that is not HH:mm shows as 00:00 until one of the selects is changed.
  private part(index: 0 | 1): string {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(this.value());
    return match ? match[index + 1] : '00';
  }
}
