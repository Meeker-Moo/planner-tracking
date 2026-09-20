import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { WorkStatus } from '../../../core/models/work-plan.model';
import { STATUS_MAP } from '../../../core/models/status.constant';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-block px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
      [style.background]="meta().bg"
      [style.color]="meta().text"
    >
      {{ meta().label }}
    </span>
  `,
})
export class StatusBadge {
  status = input.required<WorkStatus>();

  meta = computed(() => STATUS_MAP[this.status()]);
}
