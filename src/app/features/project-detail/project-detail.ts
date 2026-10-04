import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { Toolbar } from '../../shared/components/toolbar/toolbar';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { PlanFormDialog } from '../plan-list/plan-form-dialog/plan-form-dialog';
import { ActivityFormDialog } from './activity-form-dialog/activity-form-dialog';
import { WorkPlanService } from '../../core/services/work-plan.service';
import { STATUS_LIST, STATUS_MAP } from '../../core/models/status.constant';
import { Activity, TodoItem, WorkPlanInput, WorkStatus } from '../../core/models/work-plan.model';
import { fiscalYearSpanLabel, formatDateShort, formatMonthYearShort, formatMonthYearThai, todayIso } from '../../shared/utils/date.util';
import { todoProgress } from '../../shared/utils/activity.util';
import { uid } from '../../shared/utils/id.util';
import { elapsedBarBackground } from '../timeline/timeline.util';
import {
  ActivityGroup,
  buildActivityTimeline,
  countByStatus,
  daysBetween,
  filterActivities,
  groupByStartQuarter,
  quartersOf,
  scheduleNote,
  sortActivities,
} from './project-detail.util';

const MONTH_COLUMN_MIN_PX = 48;
/** How long an activity card stays ringed after its bar on the timeline is clicked. */
const HIGHLIGHT_MS = 1600;

const TONE_CLASS: Record<string, string> = {
  muted: 'text-slate-500',
  info: 'text-blue-700',
  warn: 'text-amber-700',
  danger: 'text-red-700',
};

/** One project: its details, a timeline of its activities, and add / edit / delete for activities and their to-do lists. */
@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [RouterLink, Toolbar, StatusBadge, ConfirmDialog, PlanFormDialog, ActivityFormDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grow flex flex-col min-h-0' },
  template: `
    <app-toolbar [showActions]="false" [showYear]="false" />

    <div class="grow overflow-auto">
      <div class="max-w-6xl mx-auto px-4 md:px-8 py-5 md:py-7 flex flex-col gap-5">
        <a routerLink="/plans" class="w-fit inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-blue-600">
          <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M12.5 4.5L7 10l5.5 5.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          กลับไปรายการโครงการ
        </a>

        @if (plan(); as p) {
          <!-- Project -->
          <section class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div class="h-1.5" [style.background]="statusMeta(p.status).dot"></div>
            <div class="p-5 md:p-6 flex flex-col gap-5">
              <div class="flex flex-wrap items-start gap-3">
                <div class="min-w-0 grow">
                  <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span class="rounded-md bg-slate-100 text-slate-600 font-medium px-2 py-0.5">{{ p.type || 'ไม่ระบุประเภท' }}</span>
                    <span>ปีงบประมาณ {{ yearSpan() }}</span>
                  </div>
                  <h1 class="mt-1.5 text-xl md:text-2xl font-bold text-slate-900 wrap-break-word">{{ p.name }}</h1>
                </div>
                <app-status-badge [status]="p.status" />
                <div class="flex items-center gap-1">
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                    (click)="projectFormOpen.set(true)"
                  >
                    <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                      <path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z" stroke-linejoin="round" />
                    </svg>
                    แก้ไขโครงการ
                  </button>
                  <button
                    type="button"
                    class="w-9 h-9 inline-flex items-center justify-center rounded-xl text-red-600 hover:bg-red-50 outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
                    title="ลบโครงการ"
                    aria-label="ลบโครงการ"
                    (click)="deleteProjectOpen.set(true)"
                  >
                    <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                      <path d="M4 6h12M8 6V4.5h4V6M6 6l.7 10h6.6L14 6" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>

              <dl class="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                <div class="rounded-xl bg-slate-50 px-3.5 py-3 flex items-center gap-3 min-w-0">
                  <span class="w-9 h-9 shrink-0 rounded-full bg-white ring-1 ring-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold">
                    {{ initial(p.responsible) }}
                  </span>
                  <div class="min-w-0">
                    <dt class="text-xs text-slate-500">ผู้รับผิดชอบ</dt>
                    <dd class="text-sm font-semibold text-slate-900 truncate">{{ p.responsible || '–' }}</dd>
                  </div>
                </div>
                <div class="rounded-xl bg-slate-50 px-3.5 py-3 flex items-center gap-3 min-w-0">
                  <span class="w-9 h-9 shrink-0 rounded-full bg-white ring-1 ring-slate-200 text-slate-500 flex items-center justify-center">
                    <svg viewBox="0 0 20 20" class="w-4.5 h-4.5" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
                      <rect x="3" y="4.5" width="14" height="12" rx="2" /><path d="M3 8.5h14M7 3v3M13 3v3" stroke-linecap="round" />
                    </svg>
                  </span>
                  <div class="min-w-0">
                    <dt class="text-xs text-slate-500">ระยะเวลา</dt>
                    <dd class="text-sm font-semibold text-slate-900">
                      <span class="hidden sm:inline">{{ formatMonth(p.startDate) }} – {{ formatMonth(p.endDate) }}</span>
                      <span class="sm:hidden">{{ formatMonthShort(p.startDate) }} – {{ formatMonthShort(p.endDate) }}</span>
                    </dd>
                  </div>
                </div>
                <div class="rounded-xl bg-slate-50 px-3.5 py-3 flex items-center gap-3 min-w-0">
                  <span class="w-9 h-9 shrink-0 rounded-full bg-white ring-1 ring-slate-200 text-slate-500 flex items-center justify-center">
                    <svg viewBox="0 0 20 20" class="w-4.5 h-4.5" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
                      <circle cx="10" cy="10" r="7" /><path d="M10 6.5V10l2.5 1.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </span>
                  <div class="min-w-0">
                    <dt class="text-xs text-slate-500">กำหนดการ</dt>
                    <dd class="text-sm font-semibold" [class]="schedule() ? toneClass[schedule()!.tone] : 'text-slate-900'">{{ schedule()?.text ?? '–' }}</dd>
                  </div>
                </div>
                <div class="rounded-xl bg-slate-50 px-3.5 py-3 flex items-center gap-3 min-w-0">
                  <span class="w-9 h-9 shrink-0 rounded-full bg-white ring-1 ring-slate-200 text-slate-500 flex items-center justify-center">
                    <svg viewBox="0 0 20 20" class="w-4.5 h-4.5" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
                      <rect x="3.5" y="3.5" width="13" height="13" rx="2.5" /><path d="M7 10l2 2 4-4.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </span>
                  <div class="min-w-0">
                    <dt class="text-xs text-slate-500">To do</dt>
                    <dd class="text-sm font-semibold text-slate-900 tabular-nums">
                      {{ todoTotals().total ? todoTotals().done + '/' + todoTotals().total + ' เสร็จแล้ว' : '–' }}
                    </dd>
                  </div>
                </div>
              </dl>

              <div class="flex flex-col gap-2">
                <div class="flex flex-wrap items-baseline justify-between gap-2">
                  <span class="text-sm font-semibold text-slate-700">ความคืบหน้ากิจกรรมย่อย</span>
                  @if (activities().length) {
                    <span class="text-sm text-slate-500 tabular-nums">
                      เสร็จสิ้น <b class="text-slate-900">{{ statusCounts().completed }}/{{ activities().length }}</b> ({{ donePercent() }}%)
                    </span>
                  }
                </div>
                @if (activities().length) {
                  <div class="h-2.5 rounded-full bg-slate-100 overflow-hidden flex" role="img" [attr.aria-label]="'สัดส่วนสถานะของกิจกรรมย่อย ' + statusSummary()">
                    @for (s of statusSegments(); track s.value) {
                      <div class="h-full" [style.width.%]="s.percent" [style.background]="s.dot" [title]="s.label + ' ' + s.count"></div>
                    }
                  </div>
                  <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    @for (s of statusSegments(); track s.value) {
                      <span class="inline-flex items-center gap-1.5">
                        <span class="w-2 h-2 rounded-full" [style.background]="s.dot"></span>{{ s.label }} {{ s.count }}
                      </span>
                    }
                  </div>
                } @else {
                  <p class="text-sm text-slate-400">ยังไม่มีกิจกรรมย่อย</p>
                }
              </div>

              @if (p.description) {
                <div class="border-t border-slate-100 pt-4">
                  <div class="text-xs font-semibold text-slate-500">รายละเอียดโครงการ</div>
                  <p class="mt-1 text-sm text-slate-700 whitespace-pre-line">{{ p.description }}</p>
                </div>
              }
            </div>
          </section>

          <!-- Timeline of the activities -->
          @if (timeline(); as tl) {
            <section class="bg-white border border-slate-200 rounded-2xl shadow-sm">
              <div class="px-5 pt-4 pb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <h2 class="text-base font-bold text-slate-900 grow">ไทม์ไลน์กิจกรรม</h2>
                <span class="flex items-center gap-1.5 text-xs text-slate-500">
                  <span class="w-0.5 h-3.5 bg-blue-600 rounded-full"></span>วันนี้
                </span>
                <span class="flex items-center gap-1.5 text-xs text-slate-500">
                  <span class="w-6 h-3 rounded" [style.background-image]="swatchUpcoming"></span>ช่วงที่ยังไม่ถึง
                </span>
                <span class="text-xs text-slate-400">กดที่แถบเพื่อไปยังกิจกรรม</span>
              </div>
              <div class="overflow-x-auto border-t border-slate-100">
                <div class="[--name-col:120px] sm:[--name-col:180px]" [style.min-width]="'calc(var(--name-col) + ' + tl.months.length * monthColumn + 'px)'">
                  <div class="grid bg-slate-50" [style.grid-template-columns]="'var(--name-col) 1fr'">
                    <div class="sticky left-0 z-10 bg-slate-50"></div>
                    <div class="grid" [style.grid-template-columns]="'repeat(' + tl.months.length + ', 1fr)'">
                      @for (q of tl.quarters; track $index) {
                        <div
                          class="px-1 pt-1.5 text-[11px] font-bold text-slate-500 text-center truncate border-l border-slate-200"
                          [style.grid-column]="'span ' + q.months"
                        >
                          {{ q.label }}
                        </div>
                      }
                    </div>
                  </div>
                  <div class="grid bg-slate-50 border-b border-slate-200" [style.grid-template-columns]="'var(--name-col) 1fr'">
                    <div class="sticky left-0 z-10 bg-slate-50 px-3 sm:px-4 py-2 text-xs font-bold text-slate-500 self-end">กิจกรรม</div>
                    <div class="grid" [style.grid-template-columns]="'repeat(' + tl.months.length + ', 1fr)'">
                      @for (m of tl.months; track $index) {
                        <div
                          class="py-1.5 text-xs font-bold text-center leading-tight border-l border-slate-100"
                          [class]="m.current ? 'bg-blue-100 text-blue-700' : 'text-slate-500'"
                          [attr.aria-current]="m.current ? 'date' : null"
                        >
                          {{ m.label }}
                          <span class="block text-[10px] font-normal" [class]="m.current ? 'text-blue-500' : 'text-slate-400'">{{ m.year }}</span>
                        </div>
                      }
                    </div>
                  </div>

                  @for (row of tl.rows; track row.id; let first = $first) {
                    <div class="grid border-b border-slate-100 last:border-b-0" [style.grid-template-columns]="'var(--name-col) 1fr'">
                      <div
                        class="sticky left-0 z-10 px-3 sm:px-4 py-2 border-r border-slate-100 flex items-center min-w-0"
                        [class]="first ? 'bg-slate-50 text-sm font-semibold text-slate-900' : 'bg-white text-xs text-slate-700'"
                      >
                        <span class="truncate" [title]="row.name">{{ first ? 'ทั้งโครงการ' : row.name }}</span>
                      </div>
                      <div
                        class="relative"
                        [class]="first ? 'h-11 bg-slate-50/60' : 'h-10'"
                        [style.background-image]="gridLines"
                        [style.background-size]="'calc(100% / ' + tl.months.length + ') 100%'"
                      >
                        @if (tl.currentMonth !== null) {
                          <div
                            class="absolute inset-y-0 bg-blue-500/8"
                            [style.left.%]="(tl.currentMonth / tl.months.length) * 100"
                            [style.width.%]="100 / tl.months.length"
                          ></div>
                        }
                        @if (row.bar; as b) {
                          @if (row.activity; as a) {
                            <button
                              type="button"
                              class="absolute top-1/2 -translate-y-1/2 h-6 rounded-md px-2 text-[11px] font-bold text-left whitespace-nowrap overflow-hidden text-ellipsis outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-blue-500/60"
                              [style.left.%]="b.left"
                              [style.width.%]="b.width"
                              [style.min-width.px]="6"
                              [style.background-image]="barBackground(row.status, b.elapsed)"
                              [style.color]="statusMeta(row.status).text"
                              [style.text-shadow]="textHalo"
                              [title]="a.name + ' · ' + formatDate(a.startDate) + ' – ' + formatDate(a.endDate) + ' · ' + statusMeta(row.status).label"
                              (click)="focusActivity(a.id)"
                            >
                              {{ a.name }}
                            </button>
                          } @else {
                            <div
                              class="absolute top-1/2 -translate-y-1/2 h-7 rounded-md px-2 flex items-center text-xs font-bold whitespace-nowrap overflow-hidden"
                              [style.left.%]="b.left"
                              [style.width.%]="b.width"
                              [style.background-image]="barBackground(row.status, b.elapsed)"
                              [style.color]="statusMeta(row.status).text"
                              [style.text-shadow]="textHalo"
                            >
                              {{ statusMeta(row.status).label }}
                            </div>
                          }
                        }
                        @if (tl.today !== null) {
                          <div class="absolute inset-y-0 w-0.5 bg-blue-600 pointer-events-none" [style.left.%]="tl.today"></div>
                        }
                      </div>
                    </div>
                  }
                </div>
              </div>
            </section>
          }

          <!-- Activities -->
          <section class="flex flex-col gap-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2 class="text-base font-bold text-slate-900">
                กิจกรรมย่อย <span class="font-normal text-slate-400">({{ activities().length }})</span>
              </h2>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-sm font-bold text-white shadow-sm shadow-blue-600/30 hover:bg-blue-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2"
                (click)="openAddActivity()"
              >
                <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <path d="M10 4.5v11M4.5 10h11" stroke-linecap="round" />
                </svg>
                เพิ่มกิจกรรม
              </button>
            </div>

            @if (activities().length > 0) {
              <div class="bg-white border border-slate-200 rounded-2xl shadow-sm p-3 flex flex-col gap-3">
                <div class="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5" role="group" aria-label="กรองตามสถานะ">
                  <button
                    type="button"
                    class="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                    [class]="statusFilter() === null ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
                    [attr.aria-pressed]="statusFilter() === null"
                    (click)="statusFilter.set(null)"
                  >
                    ทั้งหมด <span class="tabular-nums opacity-70">{{ inQuarter().length }}</span>
                  </button>
                  @for (s of statusList; track s.value) {
                    <button
                      type="button"
                      class="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:opacity-40"
                      [class]="statusFilter() === s.value ? 'ring-1' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
                      [style.background]="statusFilter() === s.value ? s.bg : null"
                      [style.color]="statusFilter() === s.value ? s.text : null"
                      [style.--tw-ring-color]="statusFilter() === s.value ? s.dot : null"
                      [attr.aria-pressed]="statusFilter() === s.value"
                      [disabled]="filterCounts()[s.value] === 0 && statusFilter() !== s.value"
                      (click)="toggleStatus(s.value)"
                    >
                      <span class="w-2 h-2 rounded-full" [style.background]="s.dot"></span>
                      {{ s.label }} <span class="tabular-nums opacity-70">{{ filterCounts()[s.value] }}</span>
                    </button>
                  }
                </div>
                <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
                  @if (quarterOptions().length > 1) {
                    <select
                      class="border border-slate-200 rounded-xl px-3 py-1.5 text-sm bg-white outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                      [class]="quarterFilter() !== null ? 'text-blue-700 border-blue-300' : 'text-slate-700'"
                      aria-label="กรองตามไตรมาส"
                      (change)="quarterFilter.set($any($event.target).value || null)"
                    >
                      <option value="" [selected]="quarterFilter() === null">ทุกไตรมาส</option>
                      @for (q of quarterOptions(); track q.key) {
                        <option [value]="q.key" [selected]="quarterFilter() === q.key">{{ q.label }}</option>
                      }
                    </select>
                    <label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input type="checkbox" class="w-4 h-4 accent-blue-600" [checked]="grouped()" (change)="grouped.set($any($event.target).checked)" />
                      จัดกลุ่มตามไตรมาสที่เริ่ม
                    </label>
                  }
                  <label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4 accent-blue-600" [checked]="hideDoneTodos()" (change)="hideDoneTodos.set($any($event.target).checked)" />
                    ซ่อน to do ที่เสร็จแล้ว
                  </label>
                  @if (filtering()) {
                    <button type="button" class="ml-auto text-sm font-semibold text-slate-500 hover:text-slate-900" (click)="clearFilters()">ล้างตัวกรอง</button>
                  }
                </div>
              </div>
            }

            @for (group of groups(); track group.quarter?.key ?? 'all') {
              @if (group.quarter && groups().length > 1) {
                <div class="mt-1 flex items-center gap-2 px-1">
                  <span class="text-sm font-bold text-slate-700">{{ group.quarter.label }}</span>
                  <span class="text-xs text-slate-400">{{ group.activities.length }} กิจกรรม</span>
                  <span class="grow h-px bg-slate-200"></span>
                </div>
              }
              @for (a of group.activities; track a.id) {
                <article
                  [id]="'activity-' + a.id"
                  class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex transition-shadow duration-300 scroll-mt-4"
                  [class.ring-2]="highlighted() === a.id"
                  [class.ring-blue-400]="highlighted() === a.id"
                >
                  <div class="w-1.5 shrink-0" [style.background]="statusMeta(a.status).dot"></div>
                  <div class="grow min-w-0 p-4 md:p-5 flex flex-col gap-3">
                    <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
                      <div class="min-w-0 grow">
                        <h3 class="text-base font-bold text-slate-900 wrap-break-word">{{ a.name }}</h3>
                        <div class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span class="inline-flex items-center gap-1.5">
                            <svg viewBox="0 0 20 20" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                              <rect x="3" y="4.5" width="14" height="12" rx="2" /><path d="M3 8.5h14M7 3v3M13 3v3" stroke-linecap="round" />
                            </svg>
                            {{ formatDate(a.startDate) }} – {{ formatDate(a.endDate) }}
                            @if (duration(a); as d) {
                              <span class="text-slate-400">({{ d }} วัน)</span>
                            }
                          </span>
                          @if (a.responsible) {
                            <span class="inline-flex items-center gap-1.5">
                              <svg viewBox="0 0 20 20" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                                <circle cx="10" cy="7" r="3" /><path d="M4 16.5c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5" stroke-linecap="round" />
                              </svg>
                              {{ a.responsible }}
                            </span>
                          }
                        </div>
                      </div>
                      <app-status-badge [status]="a.status" />
                      <div class="flex items-center gap-0.5 -mr-1.5">
                        <button
                          type="button"
                          class="w-8 h-8 inline-flex items-center justify-center rounded-lg text-blue-600 hover:bg-blue-50 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                          title="แก้ไขกิจกรรม"
                          [attr.aria-label]="'แก้ไขกิจกรรม ' + a.name"
                          (click)="openEditActivity(a)"
                        >
                          <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                            <path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z" stroke-linejoin="round" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          class="w-8 h-8 inline-flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
                          title="ลบกิจกรรม"
                          [attr.aria-label]="'ลบกิจกรรม ' + a.name"
                          (click)="deleteActivityTarget.set(a)"
                        >
                          <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                            <path d="M4 6h12M8 6V4.5h4V6M6 6l.7 10h6.6L14 6" stroke-linecap="round" stroke-linejoin="round" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    @if (a.description) {
                      <p class="text-sm text-slate-700 whitespace-pre-line">{{ a.description }}</p>
                    }
                    @if (a.note) {
                      <p class="text-sm text-amber-800 bg-amber-50 ring-1 ring-amber-200 rounded-lg px-3 py-2 whitespace-pre-line">
                        <span class="font-semibold">หมายเหตุ:</span> {{ a.note }}
                      </p>
                    }

                    <div class="border-t border-slate-100 pt-3 flex flex-col gap-1.5">
                      @let tp = progress(a);
                      <div class="flex items-center gap-3">
                        <span class="text-sm font-semibold text-slate-700">To do</span>
                        @if (tp.total > 0) {
                          <span class="text-xs text-slate-500 tabular-nums">{{ tp.done }}/{{ tp.total }}</span>
                          <div class="grow max-w-48 h-1.5 rounded-full overflow-hidden bg-slate-100">
                            <div class="h-full rounded-full bg-emerald-500" [style.width.%]="(tp.done / tp.total) * 100"></div>
                          </div>
                        }
                      </div>

                      <ul class="flex flex-col">
                        @for (t of visibleTodos(a); track t.id) {
                          <li class="group flex items-start gap-1 rounded-lg -mx-1.5 px-1.5 py-1 hover:bg-slate-50">
                            @if (isEditing(a, t)) {
                              <input type="checkbox" class="mt-1.5 w-4 h-4 shrink-0 accent-emerald-600" [checked]="t.done" (change)="toggleTodo(a, t.id)" [attr.aria-label]="t.text" />
                              <input
                                #todoEdit
                                type="text"
                                aria-label="แก้ไขรายการ to do"
                                class="ml-1 grow min-w-0 border border-blue-400 rounded-md px-2 py-0.5 text-sm outline-none ring-2 ring-blue-500/15"
                                [value]="t.text"
                                (keydown.enter)="saveTodo(a, t.id, $any($event.target).value)"
                                (keydown.escape)="editingTodo.set(null)"
                                (blur)="saveTodo(a, t.id, $any($event.target).value)"
                              />
                            } @else {
                              <label class="grow min-w-0 flex items-start gap-2 text-sm cursor-pointer">
                                <input type="checkbox" class="mt-0.5 w-4 h-4 shrink-0 accent-emerald-600" [checked]="t.done" (change)="toggleTodo(a, t.id)" />
                                <span class="wrap-break-word" [class]="t.done ? 'text-slate-400 line-through' : 'text-slate-800'">{{ t.text }}</span>
                              </label>
                              <div class="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                                <button
                                  type="button"
                                  class="w-6 h-6 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-blue-600 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                                  [attr.aria-label]="'แก้ไข ' + t.text"
                                  title="แก้ไข"
                                  (click)="editingTodo.set({ activityId: a.id, todoId: t.id })"
                                >
                                  <svg viewBox="0 0 20 20" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                                    <path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z" stroke-linejoin="round" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  class="w-6 h-6 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-red-600 outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
                                  [attr.aria-label]="'ลบ ' + t.text"
                                  title="ลบ"
                                  (click)="deleteTodo(a, t.id)"
                                >
                                  <svg viewBox="0 0 20 20" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                    <path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round" />
                                  </svg>
                                </button>
                              </div>
                            }
                          </li>
                        }
                      </ul>
                      @if (hideDoneTodos() && tp.done > 0) {
                        <p class="text-xs text-slate-400">ซ่อน {{ tp.done }} รายการที่เสร็จแล้ว</p>
                      }

                      <input
                        #quick
                        type="text"
                        placeholder="+ เพิ่มรายการ to do แล้วกด Enter"
                        aria-label="เพิ่มรายการ to do"
                        class="mt-1 w-full border border-dashed border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:border-solid"
                        (keydown.enter)="addTodo(a, quick.value); quick.value = ''"
                      />
                    </div>
                  </div>
                </article>
              }
            } @empty {
              @if (activities().length > 0) {
                <div class="bg-white border border-dashed border-slate-300 rounded-2xl px-6 py-10 flex flex-col items-center text-center gap-2">
                  <div class="font-semibold text-slate-700">ไม่มีกิจกรรมที่ตรงกับตัวกรอง</div>
                  <button type="button" class="mt-1 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50" (click)="clearFilters()">
                    ล้างตัวกรอง
                  </button>
                </div>
              } @else {
                <div class="bg-white border border-dashed border-slate-300 rounded-2xl px-6 py-12 flex flex-col items-center text-center gap-3">
                  <span class="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center">
                    <svg viewBox="0 0 20 20" class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                      <rect x="3.5" y="3.5" width="13" height="13" rx="2.5" /><path d="M7 8h6M7 11h6M7 14h3" stroke-linecap="round" />
                    </svg>
                  </span>
                  <div class="font-semibold text-slate-700">ยังไม่มีกิจกรรมย่อย</div>
                  <p class="text-sm text-slate-500">แยกโครงการเป็นขั้นตอน เพื่อติดตามความคืบหน้าและดูตามไตรมาสได้</p>
                  <button
                    type="button"
                    class="mt-1 px-4 py-2 rounded-xl bg-blue-600 text-sm font-bold text-white shadow-sm shadow-blue-600/30 hover:bg-blue-700"
                    (click)="openAddActivity()"
                  >
                    + เพิ่มกิจกรรมแรก
                  </button>
                </div>
              }
            }
          </section>
        } @else {
          <div class="bg-white border border-dashed border-slate-300 rounded-2xl px-6 py-14 text-center flex flex-col items-center gap-3">
            <div class="font-semibold text-slate-700">ไม่พบโครงการนี้</div>
            <p class="text-sm text-slate-500">โครงการอาจถูกลบไปแล้ว</p>
            <a routerLink="/plans" class="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">กลับไปรายการโครงการ</a>
          </div>
        }
      </div>
    </div>

    <app-plan-form-dialog
      [open]="projectFormOpen()"
      [editing]="plan() ?? null"
      (save)="onSaveProject($event)"
      (cancel)="projectFormOpen.set(false)"
    />

    <app-activity-form-dialog
      [open]="activityFormOpen()"
      [editing]="editingActivity()"
      [defaultStart]="plan()?.startDate ?? ''"
      [defaultEnd]="plan()?.endDate ?? ''"
      (save)="onSaveActivity($event)"
      (cancel)="closeActivityForm()"
    />

    <app-confirm-dialog
      [open]="deleteActivityTarget() !== null"
      title="ลบกิจกรรม"
      [message]="'ต้องการลบกิจกรรม &quot;' + (deleteActivityTarget()?.name ?? '') + '&quot; พร้อมรายการ to do ทั้งหมดหรือไม่? การลบนี้ไม่สามารถย้อนกลับได้'"
      confirmText="ลบ"
      (confirm)="confirmDeleteActivity()"
      (cancel)="deleteActivityTarget.set(null)"
    />

    <app-confirm-dialog
      [open]="deleteProjectOpen()"
      title="ลบโครงการ"
      [message]="'ต้องการลบโครงการ &quot;' + (plan()?.name ?? '') + '&quot; พร้อมกิจกรรมทั้งหมดหรือไม่? การลบนี้ไม่สามารถย้อนกลับได้'"
      confirmText="ลบ"
      (confirm)="confirmDeleteProject()"
      (cancel)="deleteProjectOpen.set(false)"
    />
  `,
})
export class ProjectDetail {
  readonly workPlanService = inject(WorkPlanService);
  private readonly router = inject(Router);
  private readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('id') ?? '')), {
    initialValue: '',
  });
  private readonly today = todayIso();

  readonly statusList = STATUS_LIST;
  readonly toneClass = TONE_CLASS;
  readonly monthColumn = MONTH_COLUMN_MIN_PX;
  readonly swatchUpcoming = elapsedBarBackground('#cbd5e1', 0);
  /** One thin line at the start of every month column; the track sets the column width as background-size. */
  /** Keeps a bar's label readable where it runs over the hatched, still-to-come part. */
  readonly textHalo = '0 0 2px #fff, 0 0 2px #fff, 0 0 2px #fff';
  readonly gridLines = 'linear-gradient(to right, #f1f5f9 1px, transparent 1px)';
  readonly formatDate = formatDateShort;
  readonly formatMonth = formatMonthYearThai;
  readonly formatMonthShort = formatMonthYearShort;
  readonly progress = todoProgress;

  plan = computed(() => this.workPlanService.plans().find((p) => p.id === this.id()));
  /** In the order they start. */
  activities = computed(() => sortActivities(this.plan()?.activities ?? []));

  statusFilter = signal<WorkStatus | null>(null);
  quarterFilter = signal<string | null>(null);
  grouped = signal(true);
  hideDoneTodos = signal(false);
  editingTodo = signal<{ activityId: string; todoId: string } | null>(null);
  highlighted = signal<string | null>(null);

  projectFormOpen = signal(false);
  deleteProjectOpen = signal(false);
  activityFormOpen = signal(false);
  editingActivity = signal<Activity | null>(null);
  deleteActivityTarget = signal<Activity | null>(null);

  private readonly todoEdit = viewChild<ElementRef<HTMLInputElement>>('todoEdit');
  private highlightTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // Put the cursor in a to-do item as soon as it turns into a text box.
    effect(() => {
      const input = this.todoEdit()?.nativeElement;
      input?.focus();
      input?.select();
    });
  }

  yearSpan = computed(() => {
    const p = this.plan();
    return p ? fiscalYearSpanLabel(p.startDate, p.endDate) : '';
  });

  schedule = computed(() => {
    const p = this.plan();
    return p ? scheduleNote(p, this.today) : null;
  });

  statusCounts = computed(() => countByStatus(this.activities()));

  donePercent = computed(() => {
    const total = this.activities().length;
    return total ? Math.round((this.statusCounts().completed / total) * 100) : 0;
  });

  /** The status bar's segments, in the order of STATUS_LIST, leaving out statuses no activity has. */
  statusSegments = computed(() => {
    const counts = this.statusCounts();
    const total = this.activities().length;
    return STATUS_LIST.filter((s) => counts[s.value] > 0).map((s) => ({ ...s, count: counts[s.value], percent: (counts[s.value] / total) * 100 }));
  });

  statusSummary = computed(() => this.statusSegments().map((s) => `${s.label} ${s.count}`).join(', '));

  todoTotals = computed(() =>
    this.activities().reduce(
      (sum, a) => {
        const p = todoProgress(a);
        return { done: sum.done + p.done, total: sum.total + p.total };
      },
      { done: 0, total: 0 },
    ),
  );

  quarterOptions = computed(() => {
    const p = this.plan();
    return p ? quartersOf(p, this.activities()) : [];
  });

  /** The activities in the chosen quarter, whatever their status; the status buttons count these. */
  inQuarter = computed(() => filterActivities(this.activities(), { status: null, quarter: this.quarterFilter() }));

  filterCounts = computed(() => countByStatus(this.inQuarter()));

  private filtered = computed(() => filterActivities(this.inQuarter(), { status: this.statusFilter(), quarter: null }));

  filtering = computed(() => this.statusFilter() !== null || this.quarterFilter() !== null);

  groups = computed<ActivityGroup[]>(() => {
    const activities = this.filtered();
    if (activities.length === 0) return [];
    return this.grouped() && this.quarterOptions().length > 1 ? groupByStartQuarter(activities) : [{ quarter: null, activities }];
  });

  /** The bars follow the filters, on an axis that always spans the whole project. */
  timeline = computed(() => {
    const p = this.plan();
    return p ? buildActivityTimeline(p, this.filtered(), this.today, this.activities()) : null;
  });

  statusMeta(status: WorkStatus) {
    return STATUS_MAP[status];
  }

  barBackground(status: WorkStatus, elapsed: number): string {
    return elapsedBarBackground(STATUS_MAP[status].bg, elapsed);
  }

  duration(a: Activity): number | null {
    const days = daysBetween(a.startDate, a.endDate);
    return days === null || days < 0 ? null : days + 1;
  }

  /** The first letter of a name, skipping Thai leading vowels (เ แ โ ใ ไ) that cannot stand alone. */
  initial(name: string): string {
    const trimmed = (name ?? '').trim().replace(/^[เแโใไ]/, '');
    return trimmed.charAt(0).toUpperCase() || '?';
  }

  toggleStatus(status: WorkStatus): void {
    this.statusFilter.update((current) => (current === status ? null : status));
  }

  clearFilters(): void {
    this.statusFilter.set(null);
    this.quarterFilter.set(null);
  }

  /** Scrolls to an activity's card and rings it for a moment. The timeline shows the filtered activities, so the card is listed. */
  focusActivity(id: string): void {
    this.highlighted.set(id);
    clearTimeout(this.highlightTimer);
    this.highlightTimer = setTimeout(() => this.highlighted.set(null), HIGHLIGHT_MS);
    document.getElementById(`activity-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  visibleTodos(a: Activity): TodoItem[] {
    const todos = a.todos ?? [];
    return this.hideDoneTodos() ? todos.filter((t) => !t.done) : todos;
  }

  isEditing(a: Activity, t: TodoItem): boolean {
    const e = this.editingTodo();
    return e?.activityId === a.id && e.todoId === t.id;
  }

  onSaveProject(input: WorkPlanInput): void {
    const plan = this.plan();
    if (plan) this.workPlanService.update(plan.id, input);
    this.projectFormOpen.set(false);
  }

  confirmDeleteProject(): void {
    const plan = this.plan();
    if (!plan) return;
    this.workPlanService.delete(plan.id);
    this.deleteProjectOpen.set(false);
    void this.router.navigate(['/plans']);
  }

  openAddActivity(): void {
    this.editingActivity.set(null);
    this.activityFormOpen.set(true);
  }

  openEditActivity(activity: Activity): void {
    this.editingActivity.set(activity);
    this.activityFormOpen.set(true);
  }

  closeActivityForm(): void {
    this.activityFormOpen.set(false);
    this.editingActivity.set(null);
  }

  onSaveActivity(activity: Activity): void {
    const plan = this.plan();
    if (plan) this.workPlanService.saveActivity(plan.id, activity);
    this.closeActivityForm();
  }

  confirmDeleteActivity(): void {
    const plan = this.plan();
    const target = this.deleteActivityTarget();
    if (plan && target) this.workPlanService.deleteActivity(plan.id, target.id);
    this.deleteActivityTarget.set(null);
  }

  toggleTodo(activity: Activity, todoId: string): void {
    this.updateTodos(activity, (todos) => todos.map((t) => (t.id === todoId ? { ...t, done: !t.done } : t)));
  }

  addTodo(activity: Activity, text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.updateTodos(activity, (todos) => [...todos, { id: uid(), text: trimmed, done: false }]);
  }

  /** Saves the edited text; an emptied item keeps its old text. Runs on Enter and again on blur, so only the first counts. */
  saveTodo(activity: Activity, todoId: string, text: string): void {
    const editing = this.editingTodo();
    if (editing?.activityId !== activity.id || editing.todoId !== todoId) return;
    this.editingTodo.set(null);
    const trimmed = text.trim();
    if (trimmed) this.updateTodos(activity, (todos) => todos.map((t) => (t.id === todoId ? { ...t, text: trimmed } : t)));
  }

  deleteTodo(activity: Activity, todoId: string): void {
    this.updateTodos(activity, (todos) => todos.filter((t) => t.id !== todoId));
  }

  private updateTodos(activity: Activity, change: (todos: NonNullable<Activity['todos']>) => NonNullable<Activity['todos']>): void {
    const plan = this.plan();
    if (!plan) return;
    this.workPlanService.saveActivity(plan.id, { ...activity, todos: change(activity.todos ?? []) });
  }
}
