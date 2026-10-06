import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StatusBadge } from '../../../shared/components/status-badge/status-badge';
import { OwnerTag } from '../../../shared/components/owner-tag/owner-tag';
import { AuthService } from '../../../core/auth/auth.service';
import { canEditPlan, canSetPlanStatus } from '../../../core/auth/permissions';
import { Activity, WorkPlan } from '../../../core/models/work-plan.model';
import { todoProgress } from '../../../shared/utils/activity.util';
import {
  fiscalYearOf,
  fiscalYearRangeLabel,
  fiscalYearSpanLabel,
  formatDateShort,
  formatDateTimeShort,
  formatMonthYearShort,
} from '../../../shared/utils/date.util';
import { PlanGroup, PlanRow } from '../plan-list.util';

/** The project list itself: a table on wide screens, cards on phones; grouped by fiscal year when it covers several. */
@Component({
  selector: 'app-plan-table',
  standalone: true,
  imports: [RouterLink, StatusBadge, OwnerTag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Wide screens: table -->
    <div class="hidden md:block bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
      <table class="w-full min-w-215 text-sm">
        <thead>
          <tr class="bg-slate-50 border-b border-slate-200 text-left">
            <th class="px-4 py-3 text-xs font-bold text-slate-500 tracking-wide">โครงการ</th>
            <th class="px-4 py-3 text-xs font-bold text-slate-500 tracking-wide">ประเภท</th>
            <th class="px-4 py-3 text-xs font-bold text-slate-500 tracking-wide">ผู้รับผิดชอบ</th>
            <th class="px-4 py-3 text-xs font-bold text-slate-500 tracking-wide">ช่วงเวลา</th>
            <th class="px-4 py-3 text-xs font-bold text-slate-500 tracking-wide">สถานะ</th>
            <th class="px-4 py-3 text-xs font-bold text-slate-500 tracking-wide text-right">จัดการ</th>
          </tr>
        </thead>
        @for (group of groups(); track group.fiscalYear) {
          <tbody>
            @if (showGroupHeaders()) {
              <tr class="bg-slate-50/80 border-b border-slate-200">
                <td colspan="6" class="px-4 py-2.5">
                  <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span class="font-bold text-slate-900">ปีงบประมาณ {{ group.fiscalYear }}</span>
                    <span class="text-xs text-slate-500">{{ fiscalRange(group.fiscalYear) }}</span>
                    <span class="text-xs text-slate-400">·</span>
                    <span class="text-xs font-semibold text-slate-600">{{ group.rows.length }} โครงการ</span>
                    @if (group.fiscalYear === currentYear()) {
                      <span class="rounded-full bg-blue-100 text-blue-700 text-[11px] font-semibold px-2 py-0.5">ปีปัจจุบัน</span>
                    }
                  </div>
                </td>
              </tr>
            }
            @for (row of group.rows; track row.plan.id) {
              @let item = row.plan;
              <tr class="border-b border-slate-100 last:border-b-0 hover:bg-blue-50/40 transition-colors">
                <td class="px-4 py-3.5 align-top">
                  <div class="flex items-start gap-2">
                    @if (row.activities.length > 0) {
                      <button
                        type="button"
                        class="mt-0.5 w-6 h-6 shrink-0 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-blue-600 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                        [attr.aria-label]="(isExpanded(item.id) ? 'ย่อ' : 'ขยาย') + 'กิจกรรมย่อยของ ' + item.name"
                        [attr.aria-expanded]="isExpanded(item.id)"
                        (click)="toggle.emit(item.id)"
                      >
                        <svg viewBox="0 0 20 20" class="w-3.5 h-3.5 transition-transform" [class.rotate-90]="isExpanded(item.id)" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                          <path d="M8 5l5 5-5 5" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                      </button>
                    } @else {
                      <span class="w-6 shrink-0"></span>
                    }
                    <div class="min-w-0">
                      <a
                        [routerLink]="['/plans', item.id]"
                        class="font-semibold text-slate-900 hover:text-blue-600 hover:underline"
                        title="ดูรายละเอียดโครงการและจัดการกิจกรรม"
                      >
                        {{ item.name }}
                      </a>
                      <app-owner-tag class="ml-1.5 align-middle" [item]="item" />
                      @if (row.carriedFrom !== null) {
                        <span class="ml-1.5 inline-flex items-center gap-1 align-middle rounded-md bg-indigo-50 text-indigo-700 text-[11px] font-semibold px-1.5 py-0.5" title="โครงการเริ่มในปีงบประมาณ {{ row.carriedFrom }} และยังดำเนินต่อเนื่องถึงปีนี้">
                          <svg viewBox="0 0 20 20" class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                            <path d="M4 5v4a3 3 0 003 3h9M12.5 8.5L16 12l-3.5 3.5" stroke-linecap="round" stroke-linejoin="round" />
                          </svg>
                          ต่อเนื่องจากปีงบ {{ row.carriedFrom }}
                        </span>
                      }
                      @if (row.activities.length > 0) {
                        <button
                          type="button"
                          class="mt-1.5 flex items-center gap-2 text-xs text-slate-500 hover:text-blue-600 whitespace-nowrap"
                          (click)="toggle.emit(item.id)"
                        >
                          <span class="w-20 shrink-0 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <span class="block h-full rounded-full bg-emerald-500" [style.width.%]="donePercent(row.activities)"></span>
                          </span>
                          กิจกรรมย่อย{{ inQuarterOnly(row) ? 'ในไตรมาส' : '' }} {{ doneCount(row.activities) }}/{{ row.activities.length }} เสร็จสิ้น
                        </button>
                      }
                    </div>
                  </div>
                </td>
                <td class="px-4 py-3.5 align-top">
                  <span class="inline-block rounded-md bg-slate-100 text-slate-600 text-xs font-medium px-2 py-1 whitespace-nowrap">{{ item.type }}</span>
                </td>
                <td class="px-4 py-3.5 align-top">
                  <span class="flex items-center gap-2 text-slate-700 whitespace-nowrap">
                    <span class="w-7 h-7 shrink-0 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold">{{ initial(item.responsible) }}</span>
                    {{ item.responsible }}
                  </span>
                </td>
                <td class="px-4 py-3.5 align-top whitespace-nowrap">
                  <div class="text-slate-700">{{ formatMonth(item.startDate) }} – {{ formatMonth(item.endDate) }}</div>
                  @if (spansYears(item)) {
                    <div class="text-xs text-slate-400">ปีงบ {{ yearSpan(item) }}</div>
                  }
                </td>
                <td class="px-4 py-3.5 align-top">
                  <app-status-badge [status]="item.status" />
                  @if (item.statusUpdatedAt) {
                    <div class="mt-1 text-[11px] text-slate-400 whitespace-nowrap">วันที่แก้ไข {{ formatDateTime(item.statusUpdatedAt) }}</div>
                  }
                </td>
                <td class="px-4 py-3 align-top text-right whitespace-nowrap">
                  <div class="inline-flex items-center gap-0.5">
                    <a [routerLink]="['/plans', item.id]" class="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60" title="รายละเอียด" [attr.aria-label]="'รายละเอียด ' + item.name">
                      <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                        <path d="M2.5 10s2.7-5.5 7.5-5.5 7.5 5.5 7.5 5.5-2.7 5.5-7.5 5.5S2.5 10 2.5 10z" /><circle cx="10" cy="10" r="2.3" />
                      </svg>
                    </a>
                    @if (canSetStatus(item)) {
                      <button type="button" class="w-8 h-8 inline-flex items-center justify-center rounded-lg text-blue-600 hover:bg-blue-50 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60" [title]="editLabel(item)" [attr.aria-label]="editLabel(item) + ' ' + item.name" (click)="edit.emit(item)">
                        <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                          <path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z" stroke-linejoin="round" />
                        </svg>
                      </button>
                    }
                    @if (canDelete(item)) {
                      <button type="button" class="w-8 h-8 inline-flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 outline-none focus-visible:ring-2 focus-visible:ring-red-500/60" title="ลบ" [attr.aria-label]="'ลบ ' + item.name" (click)="remove.emit(item)">
                        <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                          <path d="M4 6h12M8 6V4.5h4V6M6 6l.7 10h6.6L14 6" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                      </button>
                    }
                  </div>
                </td>
              </tr>
              @if (isExpanded(item.id)) {
                @for (a of row.activities; track a.id) {
                  <tr class="border-b border-slate-100 bg-slate-50/70">
                    <td class="pl-12 pr-4 py-2.5">
                      <div class="border-l-2 border-slate-200 pl-3 text-slate-700">
                        <div>{{ a.name }}</div>
                        @if (a.description) {
                          <div class="text-xs text-slate-500 whitespace-pre-line">{{ a.description }}</div>
                        }
                        @if (a.note) {
                          <div class="text-xs text-amber-700 whitespace-pre-line">หมายเหตุ: {{ a.note }}</div>
                        }
                        @if (progress(a).total > 0) {
                          <div class="text-xs text-slate-500">To do {{ progress(a).done }}/{{ progress(a).total }} เสร็จแล้ว</div>
                        }
                      </div>
                    </td>
                    <td></td>
                    <td class="px-4 py-2.5 text-slate-600">{{ a.responsible }}</td>
                    <td class="px-4 py-2.5 text-slate-600 whitespace-nowrap">{{ formatDate(a.startDate) }} – {{ formatDate(a.endDate) }}</td>
                    <td class="px-4 py-2.5">
                      <app-status-badge [status]="a.status" />
                      @if (a.statusUpdatedAt) {
                        <div class="mt-1 text-[11px] text-slate-400 whitespace-nowrap">วันที่แก้ไข {{ formatDateTime(a.statusUpdatedAt) }}</div>
                      }
                    </td>
                    <td></td>
                  </tr>
                }
              }
            }
          </tbody>
        }
      </table>
    </div>

    <!-- Phones: cards -->
    <div class="md:hidden flex flex-col gap-3">
      @for (group of groups(); track group.fiscalYear) {
        @if (showGroupHeaders()) {
          <div class="mt-2 first:mt-0 flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
            <span class="font-bold text-slate-900">ปีงบประมาณ {{ group.fiscalYear }}</span>
            <span class="text-xs font-semibold text-slate-500">{{ group.rows.length }} โครงการ</span>
            @if (group.fiscalYear === currentYear()) {
              <span class="rounded-full bg-blue-100 text-blue-700 text-[11px] font-semibold px-2 py-0.5">ปีปัจจุบัน</span>
            }
          </div>
        }
        @for (row of group.rows; track row.plan.id) {
          @let item = row.plan;
          <article class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 flex flex-col gap-2.5">
            <div class="flex items-start justify-between gap-3">
              <a [routerLink]="['/plans', item.id]" class="font-semibold text-slate-900 hover:text-blue-600">{{ item.name }}</a>
              <app-status-badge [status]="item.status" />
            </div>
            <app-owner-tag [item]="item" />
            @if (item.statusUpdatedAt) {
              <span class="text-[11px] text-slate-400">อัปเดตสถานะ {{ formatDateTime(item.statusUpdatedAt) }}</span>
            }
            @if (row.carriedFrom !== null) {
              <span class="w-fit rounded-md bg-indigo-50 text-indigo-700 text-[11px] font-semibold px-1.5 py-0.5">ต่อเนื่องจากปีงบ {{ row.carriedFrom }}</span>
            }
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600">
              <span class="rounded-md bg-slate-100 px-2 py-0.5 font-medium">{{ item.type }}</span>
              <span>{{ formatMonth(item.startDate) }} – {{ formatMonth(item.endDate) }}</span>
              <span class="flex items-center gap-1.5">
                <span class="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold">{{ initial(item.responsible) }}</span>
                {{ item.responsible }}
              </span>
            </div>
            @if (row.activities.length > 0) {
              <button
                type="button"
                class="flex items-center gap-2 text-xs text-slate-500"
                [attr.aria-expanded]="isExpanded(item.id)"
                (click)="toggle.emit(item.id)"
              >
                <span class="grow h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <span class="block h-full rounded-full bg-emerald-500" [style.width.%]="donePercent(row.activities)"></span>
                </span>
                กิจกรรมย่อย{{ inQuarterOnly(row) ? 'ในไตรมาส' : '' }} {{ doneCount(row.activities) }}/{{ row.activities.length }}
                <svg viewBox="0 0 20 20" class="w-3.5 h-3.5 transition-transform" [class.rotate-90]="isExpanded(item.id)" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <path d="M8 5l5 5-5 5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
              @if (isExpanded(item.id)) {
                <ul class="flex flex-col gap-2 border-l-2 border-slate-200 pl-3">
                  @for (a of row.activities; track a.id) {
                    <li class="text-sm text-slate-700">
                      <div class="flex items-start justify-between gap-2">
                        <span>{{ a.name }}</span>
                        <app-status-badge [status]="a.status" />
                      </div>
                      <div class="text-xs text-slate-500">
                        {{ formatDate(a.startDate) }} – {{ formatDate(a.endDate) }}{{ a.responsible ? ' · ' + a.responsible : '' }}
                      </div>
                      @if (a.statusUpdatedAt) {
                        <div class="text-[11px] text-slate-400">อัปเดตสถานะ {{ formatDateTime(a.statusUpdatedAt) }}</div>
                      }
                      @if (a.note) {
                        <div class="text-xs text-amber-700 whitespace-pre-line">หมายเหตุ: {{ a.note }}</div>
                      }
                    </li>
                  }
                </ul>
              }
            }
            <div class="flex items-center justify-end gap-1 border-t border-slate-100 pt-2.5 -mb-1">
              <a [routerLink]="['/plans', item.id]" class="px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">รายละเอียด</a>
              @if (canSetStatus(item)) {
                <button type="button" class="px-3 py-1.5 rounded-lg text-sm font-semibold text-blue-600 hover:bg-blue-50" (click)="edit.emit(item)">{{ editLabel(item) }}</button>
              }
              @if (canDelete(item)) {
                <button type="button" class="px-3 py-1.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50" (click)="remove.emit(item)">ลบ</button>
              }
            </div>
          </article>
        }
      }
    </div>
  `,
})
export class PlanTable {
  groups = input.required<PlanGroup[]>();
  expandedIds = input.required<ReadonlySet<string>>();
  showGroupHeaders = input(false);
  currentYear = input.required<number>();

  edit = output<WorkPlan>();
  remove = output<WorkPlan>();
  toggle = output<string>();

  private readonly auth = inject(AuthService);

  readonly fiscalRange = fiscalYearRangeLabel;
  readonly yearSpan = (p: WorkPlan) => fiscalYearSpanLabel(p.startDate, p.endDate);
  readonly progress = todoProgress;
  readonly formatDate = formatDateShort;
  readonly formatDateTime = formatDateTimeShort;
  readonly formatMonth = formatMonthYearShort;

  /** Deleting, like editing in full, is for the project's owner and Admin. */
  canDelete(plan: WorkPlan): boolean {
    return canEditPlan(this.auth.user(), plan);
  }

  /** The account responsible for the project may set its status (the form then shows only that). */
  canSetStatus(plan: WorkPlan): boolean {
    return canSetPlanStatus(this.auth.user(), plan);
  }

  editLabel(plan: WorkPlan): string {
    return canEditPlan(this.auth.user(), plan) ? 'แก้ไข' : 'เปลี่ยนสถานะ';
  }

  isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
  }

  /** True when the quarter filter left out some of the project's sub-activities. */
  inQuarterOnly(row: PlanRow): boolean {
    return row.activities.length < (row.plan.activities?.length ?? 0);
  }

  doneCount(activities: Activity[]): number {
    return activities.filter((a) => a.status === 'completed').length;
  }

  donePercent(activities: Activity[]): number {
    return activities.length ? Math.round((this.doneCount(activities) / activities.length) * 100) : 0;
  }

  spansYears(p: WorkPlan): boolean {
    const first = fiscalYearOf(p.startDate);
    const last = fiscalYearOf(p.endDate);
    return first !== null && last !== null && last > first;
  }

  /** The first letter of a name, skipping Thai leading vowels (เ แ โ ใ ไ) that cannot stand alone. */
  initial(name: string): string {
    const trimmed = (name ?? '').trim().replace(/^[เแโใไ]/, '');
    return trimmed.charAt(0).toUpperCase() || '?';
  }
}
