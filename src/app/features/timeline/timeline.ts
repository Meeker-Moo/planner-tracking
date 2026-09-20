import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Toolbar } from '../../shared/components/toolbar/toolbar';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { PlanFormDialog } from '../plan-list/plan-form-dialog/plan-form-dialog';
import { WorkPlanService } from '../../core/services/work-plan.service';
import { ExportImportService } from '../../core/services/export-import.service';
import { STATUS_LIST, THAI_MONTHS, STATUS_MAP } from '../../core/models/status.constant';
import { Activity, WorkPlan, WorkPlanInput, WorkStatus } from '../../core/models/work-plan.model';
import {
  currentFiscalYear,
  fiscalMonths,
  fiscalYearRangeLabel,
  fiscalYearSpanLabel,
  formatDateThai,
  formatMonthYearThai,
  monthPositionInFiscalYears,
  monthSpanInFiscalYear,
  todayIso,
} from '../../shared/utils/date.util';
import { todoProgress } from '../../shared/utils/activity.util';
import { buildTimelineLayout, elapsedBarBackground, elapsedFraction } from './timeline.util';

const NAME_COLUMN_PX = 200;
const MONTH_COLUMN_MIN_PX = 56;
const TIP_WIDTH_PX = 320;
const TIP_MARGIN_PX = 8;
const TIP_HEIGHT_ESTIMATE_PX = 280;

const TODAY_COLOR = '#2563eb';
const TODAY_BAND = 'rgb(59 130 246 / 0.09)';
const LEGEND_SWATCH_COLOR = '#cbd5e1';

/** What the hover card shows for a project or an activity row. */
interface TimelineTip {
  kind: 'project' | 'activity';
  title: string;
  /** For an activity: the project it belongs to. */
  parent?: string;
  status: WorkStatus;
  lines: { label: string; value: string }[];
}

interface TipPlacement {
  info: TimelineTip;
  x: number;
  y: number;
}

/** Keeps only the lines that have something to show. */
function tipLines(lines: [string, string | undefined][]): TimelineTip['lines'] {
  return lines.filter((l): l is [string, string] => !!l[1]?.trim()).map(([label, value]) => ({ label, value }));
}

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [Toolbar, PlanFormDialog, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-toolbar
      [years]="workPlanService.years()"
      [selectedYear]="selectedYear()"
      (yearChange)="selectedYear.set($event)"
      (addClick)="formOpen.set(true)"
      (importJson)="onImportJson($event)"
      (exportJson)="exportImportService.exportJson(plansInYear(), selectedYear())"
      (exportExcel)="exportImportService.exportExcel(plansInYear(), selectedYear())"
    />

    <div class="shrink-0 bg-white border-b border-slate-200 flex flex-wrap items-center gap-4 md:gap-6 px-4 md:px-8 py-3.5">
      <span class="text-sm font-semibold text-slate-500">สถานะ:</span>
      @for (s of statusList; track s.value) {
        <span class="flex items-center gap-1.5 text-sm text-slate-700">
          <span class="w-2.5 h-2.5 rounded-full inline-block" [style.background]="s.dot"></span>{{ s.label }}
        </span>
      }
      <span class="hidden sm:block w-px h-4 bg-slate-200"></span>
      <span class="flex items-center gap-1.5 text-sm text-slate-700">
        <span class="w-6 h-3 rounded" [style.background-image]="swatchElapsed"></span>ผ่านมาแล้ว
      </span>
      <span class="flex items-center gap-1.5 text-sm text-slate-700">
        <span class="w-6 h-3 rounded" [style.background-image]="swatchUpcoming"></span>ยังไม่ถึง
      </span>
      <span class="flex items-center gap-1.5 text-sm text-slate-700">
        <span class="w-3 h-3 rounded-sm border border-blue-300 bg-blue-100"></span>เดือนปัจจุบัน
      </span>
      <div class="grow"></div>
      <span class="text-sm text-slate-500">
        มุมมอง: รายเดือน ปีงบประมาณ {{ selectedYear() }} ({{ fiscalRange(selectedYear()) }})
        @if (axis().last > axis().first) {
          · แสดงต่อเนื่อง {{ axis().last - axis().first + 1 }} ปีงบ ({{ axis().first }} – {{ axis().last }})
        }
      </span>
    </div>

    <div class="grow overflow-auto p-4 md:p-8" (scroll)="hideTip()">
      <div class="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <div [style.min-width.px]="minWidth()">
          <div class="grid bg-slate-50 border-b border-slate-200" [style.grid-template-columns]="gridColumns()">
            <div class="sticky left-0 z-10 bg-slate-50"></div>
            @for (g of fiscalGroups(); track g.fiscalYear) {
              <div
                class="px-2 py-1.5 text-xs font-bold text-center border-l-2 border-slate-300"
                [class]="g.selected ? 'bg-blue-50 text-blue-700' : 'text-slate-500'"
                [style.grid-column]="g.gridColumn"
              >
                ปีงบประมาณ {{ g.fiscalYear }}
              </div>
            }
          </div>
          <div class="grid bg-slate-50 border-b border-slate-200" [style.grid-template-columns]="gridColumns()">
            <div class="sticky left-0 z-10 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">ชื่อโครงการ</div>
            @for (m of monthHeaders(); track $index) {
              <div
                class="px-1 py-2 text-xs font-bold text-center leading-tight"
                [class]="(m.firstOfYear ? 'border-l-2 border-slate-300 ' : 'border-l border-slate-100 ') + (m.current ? 'bg-blue-100 text-blue-700' : 'text-slate-500')"
                [attr.aria-current]="m.current ? 'date' : null"
              >
                {{ m.label }}
                <span class="block text-[10px] font-normal" [class]="m.current ? 'text-blue-500' : 'text-slate-400'">{{ m.year }}</span>
              </div>
            }
          </div>

          @for (row of rows(); track row.id) {
            <div
              class="grid items-center border-b border-slate-100 last:border-b-0"
              [class]="row.isActivity ? 'min-h-10 bg-slate-50' : 'min-h-14'"
              [style.grid-template-columns]="gridColumns()"
              [style.background-image]="todayBackground()"
            >
              <div
                class="sticky left-0 z-10 px-4 py-2.5 border-r border-slate-100 self-stretch flex items-center outline-none hover:text-blue-700 focus-visible:text-blue-700"
                [class]="row.isActivity ? 'bg-slate-50 pl-8 text-xs text-slate-700' : 'bg-white text-sm font-semibold text-slate-900'"
                tabindex="0"
                (mouseenter)="showTip($event, row.tip)"
                (mouseleave)="hideTip()"
                (focus)="showTip($event, row.tip)"
                (blur)="hideTip()"
              >
                {{ row.name }}
              </div>
              @if (row.col) {
                <div
                  class="rounded-lg flex items-center px-3 text-xs font-bold whitespace-nowrap overflow-hidden text-ellipsis mx-1"
                  [class]="row.isActivity ? 'h-6' : 'h-8'"
                  [style.grid-column]="row.col"
                  [style.background-color]="row.bg"
                  [style.background-image]="row.barBackground"
                  [style.color]="row.text"
                  (mouseenter)="showTip($event, row.tip)"
                  (mouseleave)="hideTip()"
                >
                  {{ row.statusLabel }}
                </div>
              }
            </div>
          } @empty {
            <div class="px-4 py-12 text-center text-slate-400">ยังไม่มีโครงการในปีนี้</div>
          }
        </div>
      </div>
    </div>

    @if (tip(); as t) {
      <div
        role="tooltip"
        class="fixed z-40 bg-white border border-slate-200 rounded-xl shadow-xl p-4 pointer-events-none"
        [style.width.px]="tipWidth"
        [style.left.px]="t.x"
        [style.top.px]="t.y"
      >
        <div class="text-xs font-semibold text-slate-500">
          {{ t.info.kind === 'project' ? 'โครงการ' : 'กิจกรรมย่อยของโครงการ “' + t.info.parent + '”' }}
        </div>
        <div class="mt-0.5 text-sm font-bold text-slate-900">{{ t.info.title }}</div>
        <div class="mt-2"><app-status-badge [status]="t.info.status" /></div>
        <dl class="mt-3 grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5 text-xs">
          @for (line of t.info.lines; track line.label) {
            <dt class="text-slate-500">{{ line.label }}</dt>
            <dd class="text-slate-800 whitespace-pre-line wrap-break-word">{{ line.value }}</dd>
          }
        </dl>
      </div>
    }

    <app-plan-form-dialog [open]="formOpen()" [editing]="null" (save)="onSave($event)" (cancel)="formOpen.set(false)" />

    @if (importPending()) {
      <div class="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
        <div class="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 flex flex-col gap-4">
          <h2 class="text-lg font-bold text-slate-900">นำเข้าข้อมูล JSON</h2>
          <p class="text-sm text-slate-600">
            พบ {{ importPending()!.length }} รายการในไฟล์ ต้องการแทนที่ข้อมูลเดิมทั้งหมด หรือผสานเข้ากับข้อมูลที่มีอยู่?
          </p>
          <div class="flex flex-col gap-2">
            <button type="button" class="px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-bold text-white" (click)="confirmImport('merge')">
              ผสานกับข้อมูลเดิม
            </button>
            <button type="button" class="px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700" (click)="confirmImport('replace')">
              แทนที่ทั้งหมด
            </button>
            <button type="button" class="px-4 py-2.5 text-sm font-semibold text-slate-500" (click)="importPending.set(null)">
              ยกเลิก
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class Timeline {
  readonly workPlanService = inject(WorkPlanService);
  readonly exportImportService = inject(ExportImportService);

  readonly statusList = STATUS_LIST;
  readonly fiscalRange = fiscalYearRangeLabel;
  readonly tipWidth = TIP_WIDTH_PX;
  readonly swatchElapsed = elapsedBarBackground(LEGEND_SWATCH_COLOR, 1);
  readonly swatchUpcoming = elapsedBarBackground(LEGEND_SWATCH_COLOR, 0);

  private readonly today = todayIso();

  selectedYear = signal(currentFiscalYear());
  formOpen = signal(false);
  importPending = signal<WorkPlan[] | null>(null);
  tip = signal<TipPlacement | null>(null);

  plansInYear = computed(() => this.workPlanService.plans().filter((p) => p.year === this.selectedYear()));

  // Projects that run during the selected fiscal year.
  private visiblePlans = computed(() =>
    this.workPlanService
      .plans()
      .filter((p) => monthSpanInFiscalYear(p.startDate, p.endDate, this.selectedYear()) !== null),
  );

  // The projects laid out on the axis: the selected fiscal year, widened to the whole span of each project shown.
  private layout = computed(() => buildTimelineLayout(this.visiblePlans(), this.selectedYear()));

  axis = computed(() => ({ first: this.layout().firstYear, last: this.layout().lastYear }));

  private fiscalYears = computed(() => {
    const { first, last } = this.axis();
    return Array.from({ length: last - first + 1 }, (_, i) => first + i);
  });

  private monthCount = computed(() => this.fiscalYears().length * 12);

  gridColumns = computed(() => `${NAME_COLUMN_PX}px repeat(${this.monthCount()}, minmax(${MONTH_COLUMN_MIN_PX}px, 1fr))`);

  minWidth = computed(() => NAME_COLUMN_PX + this.monthCount() * MONTH_COLUMN_MIN_PX);

  // Today's place on the axis in months from October of the first fiscal year (e.g. 11.6 = late September).
  private todayPosition = computed(() => monthPositionInFiscalYears(this.today, this.axis().first) ?? -1);

  private currentMonthIndex = computed(() => {
    const position = this.todayPosition();
    return position >= 0 && position < this.monthCount() ? Math.floor(position) : -1;
  });

  /**
   * Behind every row: a tint over the current month's column and a thin line at today's exact place in it.
   * Column edges are worked out in CSS, because the month columns share the width left after the name column.
   */
  todayBackground = computed(() => {
    const index = this.currentMonthIndex();
    if (index < 0) return null;
    const edge = (months: number) =>
      `calc(${NAME_COLUMN_PX}px + (100% - ${NAME_COLUMN_PX}px) * ${months} / ${this.monthCount()})`;
    const today = edge(this.todayPosition());
    return (
      `linear-gradient(to right, transparent ${today}, ${TODAY_COLOR} ${today}, ${TODAY_COLOR} calc(${today} + 2px), transparent calc(${today} + 2px)), ` +
      `linear-gradient(to right, transparent ${edge(index)}, ${TODAY_BAND} ${edge(index)}, ${TODAY_BAND} ${edge(index + 1)}, transparent ${edge(index + 1)})`
    );
  });

  fiscalGroups = computed(() =>
    this.fiscalYears().map((fiscalYear, i) => ({
      fiscalYear,
      selected: fiscalYear === this.selectedYear(),
      gridColumn: `${i * 12 + 2} / span 12`,
    })),
  );

  // Column headers: for each fiscal year, October of the previous calendar year first, then January to September.
  monthHeaders = computed(() => {
    const current = this.currentMonthIndex();
    return this.fiscalYears().flatMap((fiscalYear, yearIndex) =>
      fiscalMonths(fiscalYear).map((m, i) => ({
        label: THAI_MONTHS[m.month],
        year: ((m.year + 543) % 100).toString().padStart(2, '0'),
        firstOfYear: i === 0,
        current: yearIndex * 12 + i === current,
      })),
    );
  });

  rows = computed(() =>
    this.layout().rows.map((r) => {
      const meta = STATUS_MAP[r.status];
      return {
        id: r.id,
        name: r.name,
        isActivity: !!r.activity,
        col: r.span ? `${r.span[0] + 1} / ${r.span[1] + 2}` : null,
        bg: meta.bg,
        text: meta.text,
        statusLabel: meta.label,
        barBackground: elapsedBarBackground(meta.bg, r.span ? elapsedFraction(r.span, this.todayPosition()) : 0),
        tip: r.activity ? this.activityTip(r.plan, r.activity) : this.projectTip(r.plan),
      };
    }),
  );

  showTip(event: Event, info: TimelineTip): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const fitsRight = window.innerWidth - rect.right >= TIP_WIDTH_PX + TIP_MARGIN_PX * 2;
    const maxY = Math.max(TIP_MARGIN_PX, window.innerHeight - TIP_HEIGHT_ESTIMATE_PX - TIP_MARGIN_PX);
    const x = fitsRight
      ? rect.right + TIP_MARGIN_PX
      : Math.max(TIP_MARGIN_PX, Math.min(rect.left, window.innerWidth - TIP_WIDTH_PX - TIP_MARGIN_PX));
    const y = Math.min(fitsRight ? rect.top : rect.bottom + TIP_MARGIN_PX, maxY);
    this.tip.set({ info, x, y: Math.max(TIP_MARGIN_PX, y) });
  }

  hideTip(): void {
    if (this.tip()) this.tip.set(null);
  }

  private projectTip(p: WorkPlan): TimelineTip {
    const activities = p.activities ?? [];
    const done = activities.filter((a) => a.status === 'completed').length;
    return {
      kind: 'project',
      title: p.name,
      status: p.status,
      lines: tipLines([
        ['ระยะเวลา', `${formatMonthYearThai(p.startDate)} – ${formatMonthYearThai(p.endDate)}`],
        ['ปีงบประมาณ', fiscalYearSpanLabel(p.startDate, p.endDate)],
        ['ประเภท', p.type],
        ['ผู้รับผิดชอบ', p.responsible],
        ['รายละเอียด', p.description],
        ['กิจกรรมย่อย', activities.length ? `${done}/${activities.length} เสร็จสิ้น` : undefined],
      ]),
    };
  }

  private activityTip(p: WorkPlan, a: Activity): TimelineTip {
    return {
      kind: 'activity',
      title: a.name,
      parent: p.name,
      status: a.status,
      lines: tipLines([
        ['ระยะเวลา', `${formatDateThai(a.startDate)} – ${formatDateThai(a.endDate)}`],
        ['ปีงบประมาณ', fiscalYearSpanLabel(a.startDate, a.endDate)],
        ['ผู้รับผิดชอบ', a.responsible],
        ['รายละเอียด', a.description],
        ['หมายเหตุ', a.note],
        ['To do', todoProgress(a).total ? `${todoProgress(a).done}/${todoProgress(a).total} เสร็จแล้ว` : undefined],
      ]),
    };
  }

  onSave(input: WorkPlanInput): void {
    this.workPlanService.add(input);
    this.formOpen.set(false);
  }

  async onImportJson(file: File): Promise<void> {
    try {
      const plans = await this.exportImportService.importJson(file);
      this.importPending.set(plans);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'นำเข้าไฟล์ไม่สำเร็จ');
    }
  }

  confirmImport(mode: 'merge' | 'replace'): void {
    const plans = this.importPending();
    if (!plans) return;
    if (mode === 'replace') {
      this.workPlanService.replaceAll(plans);
    } else {
      this.workPlanService.mergeAll(plans);
    }
    this.importPending.set(null);
  }
}
