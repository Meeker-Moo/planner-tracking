import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Toolbar } from '../../shared/components/toolbar/toolbar';
import { WorkPlanService } from '../../core/services/work-plan.service';
import { STATUS_LIST, STATUS_MAP, THAI_MONTHS } from '../../core/models/status.constant';
import {
  currentFiscalYear,
  fiscalYearRangeLabel,
  formatMonthYearShort,
  todayIso,
} from '../../shared/utils/date.util';
import { summarizeYear } from './dashboard.util';

// One color for every nominal comparison (type, month); status bars keep the status colors used across the app.
const BAR_COLOR = '#2a78d6';
const METER_TRACK_COLOR = '#cde2fb';
const COLUMN_MAX_HEIGHT_PX = 120;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [Toolbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-toolbar
      [years]="workPlanService.years()"
      [selectedYear]="selectedYear()"
      [showActions]="false"
      (yearChange)="selectedYear.set($event)"
    />

    <div class="grow overflow-auto p-4 md:p-8">
      <div class="max-w-6xl mx-auto flex flex-col gap-6">
        <div>
          <h1 class="text-xl font-bold text-slate-900">สรุปภาพรวมโครงการ</h1>
          <p class="text-sm text-slate-500">ปีงบประมาณ {{ selectedYear() }} ({{ fiscalRange(selectedYear()) }})</p>
        </div>

        @if (summary().projectCount === 0) {
          <div class="bg-white border border-slate-200 rounded-xl px-4 py-12 text-center text-slate-400">
            ยังไม่มีโครงการในปีนี้
          </div>
        } @else {
          <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div class="col-span-2 lg:col-span-1 bg-white border border-slate-200 rounded-xl p-5">
              <div class="text-sm text-slate-500">โครงการทั้งหมด</div>
              <div class="mt-1 text-5xl font-semibold text-slate-900">{{ summary().projectCount }}</div>
            </div>

            <div class="bg-white border border-slate-200 rounded-xl p-5">
              <div class="flex items-center gap-2 text-sm text-slate-500">
                <span class="w-2.5 h-2.5 rounded-full" [style.background]="statusMap['completed'].dot"></span>เสร็จสิ้น
              </div>
              <div class="mt-1 text-3xl font-semibold text-slate-900">{{ summary().byStatus['completed'] }}</div>
              <div class="text-xs text-slate-500">{{ percent(summary().byStatus['completed'], summary().projectCount) }}% ของทั้งหมด</div>
            </div>

            <div class="bg-white border border-slate-200 rounded-xl p-5">
              <div class="flex items-center gap-2 text-sm text-slate-500">
                <span class="w-2.5 h-2.5 rounded-full" [style.background]="statusMap['in-progress'].dot"></span>กำลังดำเนินการ
              </div>
              <div class="mt-1 text-3xl font-semibold text-slate-900">{{ summary().byStatus['in-progress'] }}</div>
              <div class="text-xs text-slate-500">{{ percent(summary().byStatus['in-progress'], summary().projectCount) }}% ของทั้งหมด</div>
            </div>

            <div class="bg-white border border-slate-200 rounded-xl p-5">
              <div class="flex items-center gap-2 text-sm text-slate-500">
                <span class="w-2.5 h-2.5 rounded-full" [style.background]="statusMap['delayed'].dot"></span>ต้องติดตาม
              </div>
              <div class="mt-1 text-3xl font-semibold text-slate-900">{{ summary().attention.length }}</div>
              <div class="text-xs text-slate-500">ล่าช้า {{ summary().byStatus['delayed'] }} · เลยกำหนด {{ overdueCount() }}</div>
            </div>

            <div class="bg-white border border-slate-200 rounded-xl p-5">
              <div class="text-sm text-slate-500">กิจกรรมย่อยที่เสร็จสิ้น</div>
              @if (summary().activityTotal > 0) {
                <div class="mt-1 text-3xl font-semibold text-slate-900">
                  {{ summary().activityDone }}<span class="text-lg font-medium text-slate-400">/{{ summary().activityTotal }}</span>
                </div>
                <div class="mt-2 h-1.5 rounded-full overflow-hidden" [style.background]="meterTrack">
                  <div
                    class="h-full rounded-full"
                    [style.background]="barColor"
                    [style.width.%]="percent(summary().activityDone, summary().activityTotal)"
                  ></div>
                </div>
                <div class="mt-1 text-xs text-slate-500">{{ percent(summary().activityDone, summary().activityTotal) }}%</div>
              } @else {
                <div class="mt-1 text-3xl font-semibold text-slate-300">–</div>
                <div class="text-xs text-slate-500">ยังไม่มีกิจกรรมย่อย</div>
              }
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section class="bg-white border border-slate-200 rounded-xl p-5">
              <h2 class="text-base font-bold text-slate-900">โครงการตามสถานะ</h2>
              <p class="text-sm text-slate-500 mb-4">จำนวนโครงการในแต่ละสถานะ</p>
              <div class="flex flex-col gap-2.5">
                @for (row of statusRows(); track row.label) {
                  <div class="flex items-center gap-3">
                    <span class="w-32 shrink-0 text-sm text-slate-700">{{ row.label }}</span>
                    <div class="grow flex items-center gap-2 border-l border-slate-200 min-h-5">
                      @if (row.count > 0) {
                        <div class="h-5 rounded-r" [style.background]="row.color" [style.width.%]="row.width"></div>
                      }
                      <span class="text-sm font-semibold text-slate-700 tabular-nums">{{ row.count }}</span>
                    </div>
                  </div>
                }
              </div>
            </section>

            <section class="bg-white border border-slate-200 rounded-xl p-5">
              <h2 class="text-base font-bold text-slate-900">โครงการตามประเภท</h2>
              <p class="text-sm text-slate-500 mb-4">เรียงจากมากไปน้อย</p>
              <div class="flex flex-col gap-2.5">
                @for (row of typeRows(); track row.label) {
                  <div class="flex items-center gap-3">
                    <span class="w-32 shrink-0 text-sm text-slate-700 truncate" [title]="row.label">{{ row.label }}</span>
                    <div class="grow flex items-center gap-2 border-l border-slate-200 min-h-5">
                      <div class="h-5 rounded-r" [style.background]="barColor" [style.width.%]="row.width"></div>
                      <span class="text-sm font-semibold text-slate-700 tabular-nums">{{ row.count }}</span>
                    </div>
                  </div>
                }
              </div>
            </section>
          </div>

          <section class="bg-white border border-slate-200 rounded-xl p-5">
            <h2 class="text-base font-bold text-slate-900">โครงการที่ดำเนินอยู่รายเดือน</h2>
            <p class="text-sm text-slate-500 mb-4">จำนวนโครงการที่มีช่วงเวลาคาบเกี่ยวกับแต่ละเดือนของปีงบประมาณ {{ selectedYear() }} (เริ่มที่ ต.ค.)</p>
            <div class="flex gap-1.5 sm:gap-3 border-b border-slate-200">
              @for (col of monthColumns(); track col.label) {
                <div
                  class="flex-1 min-w-0 h-40 flex flex-col items-center justify-end gap-1"
                  [title]="col.label + ': ' + col.count + ' โครงการ'"
                >
                  <span class="text-xs text-slate-600 tabular-nums">{{ col.count }}</span>
                  <div class="w-6 max-w-full rounded-t" [style.background]="barColor" [style.height.px]="col.height"></div>
                </div>
              }
            </div>
            <div class="flex gap-1.5 sm:gap-3 mt-1.5">
              @for (col of monthColumns(); track col.label) {
                <span class="flex-1 min-w-0 text-center text-xs text-slate-500">{{ col.label }}</span>
              }
            </div>
          </section>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section class="bg-white border border-slate-200 rounded-xl p-5">
              <h2 class="text-base font-bold text-slate-900">ตามผู้รับผิดชอบ</h2>
              <p class="text-sm text-slate-500 mb-3">จำนวนโครงการและกิจกรรมย่อยที่รับผิดชอบ</p>
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b border-slate-200 text-left text-xs font-bold text-slate-500">
                      <th class="py-2 pr-3">ผู้รับผิดชอบ</th>
                      <th class="py-2 px-3 text-right">โครงการ</th>
                      <th class="py-2 px-3 text-right">เสร็จสิ้น</th>
                      <th class="py-2 px-3 text-right">ล่าช้า</th>
                      <th class="py-2 pl-3 text-right">กิจกรรมย่อย</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of summary().byResponsible; track r.name) {
                      <tr class="border-b border-slate-100 last:border-b-0">
                        <td class="py-2.5 pr-3 text-slate-900">{{ r.name }}</td>
                        <td class="py-2.5 px-3 text-right tabular-nums text-slate-700">{{ r.projects }}</td>
                        <td class="py-2.5 px-3 text-right tabular-nums text-slate-700">{{ r.completed }}</td>
                        <td class="py-2.5 px-3 text-right tabular-nums text-slate-700">{{ r.delayed }}</td>
                        <td class="py-2.5 pl-3 text-right tabular-nums text-slate-700">
                          {{ r.activitiesTotal ? r.activitiesDone + '/' + r.activitiesTotal : '–' }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>

            <section class="bg-white border border-slate-200 rounded-xl p-5">
              <h2 class="text-base font-bold text-slate-900">โครงการที่ต้องติดตาม</h2>
              <p class="text-sm text-slate-500 mb-3">สถานะล่าช้า หรือยังไม่เสร็จทั้งที่เลยวันสิ้นสุดแล้ว</p>
              @for (item of summary().attention; track item.plan.id) {
                <div class="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-b-0">
                  <span
                    class="shrink-0 mt-0.5 px-2 py-0.5 rounded-full text-xs font-semibold"
                    [style.background]="delayedMeta.bg"
                    [style.color]="delayedMeta.text"
                  >
                    ⚠ {{ item.reason === 'delayed' ? 'ล่าช้า' : 'เลยกำหนด' }}
                  </span>
                  <div class="min-w-0 grow">
                    <div class="text-sm font-semibold text-slate-900">{{ item.plan.name }}</div>
                    <div class="text-xs text-slate-500">
                      {{ item.plan.responsible || 'ไม่ระบุผู้รับผิดชอบ' }} · สิ้นสุด {{ formatMonth(item.plan.endDate) }}
                    </div>
                  </div>
                </div>
              } @empty {
                <p class="py-6 text-center text-sm text-slate-400">ไม่มีโครงการที่ต้องติดตาม</p>
              }
            </section>
          </div>
        }
      </div>
    </div>
  `,
})
export class Dashboard {
  readonly workPlanService = inject(WorkPlanService);

  readonly barColor = BAR_COLOR;
  readonly meterTrack = METER_TRACK_COLOR;
  readonly statusMap = STATUS_MAP;
  readonly delayedMeta = STATUS_MAP['delayed'];
  readonly fiscalRange = fiscalYearRangeLabel;
  readonly formatMonth = formatMonthYearShort;

  private readonly today = todayIso();

  selectedYear = signal(currentFiscalYear());

  summary = computed(() => summarizeYear(this.workPlanService.plans(), this.selectedYear(), this.today));

  overdueCount = computed(() => this.summary().attention.filter((i) => i.reason === 'overdue').length);

  statusRows = computed(() => {
    const byStatus = this.summary().byStatus;
    const max = Math.max(1, ...STATUS_LIST.map((s) => byStatus[s.value]));
    return STATUS_LIST.map((s) => ({
      label: s.label,
      color: s.dot,
      count: byStatus[s.value],
      width: this.barWidth(byStatus[s.value], max),
    }));
  });

  typeRows = computed(() => {
    const rows = this.summary().byType;
    const max = Math.max(1, ...rows.map((r) => r.count));
    return rows.map((r) => ({ ...r, width: this.barWidth(r.count, max) }));
  });

  monthColumns = computed(() => {
    const counts = this.summary().byMonth;
    const max = Math.max(1, ...counts);
    return counts.map((count, i) => ({
      label: THAI_MONTHS[(9 + i) % 12],
      count,
      height: count === 0 ? 0 : Math.max(4, Math.round((count / max) * COLUMN_MAX_HEIGHT_PX)),
    }));
  });

  percent(part: number, total: number): number {
    return total === 0 ? 0 : Math.round((part / total) * 100);
  }

  // Bars are drawn from the shared baseline; a non-zero value never rounds down to an invisible sliver.
  private barWidth(count: number, max: number): number {
    return count === 0 ? 0 : Math.max(2, (count / max) * 85);
  }
}
