import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { Toolbar } from '../../shared/components/toolbar/toolbar';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { PlanFormDialog } from '../plan-list/plan-form-dialog/plan-form-dialog';
import { ActivityFormDialog } from './activity-form-dialog/activity-form-dialog';
import { WorkPlanService } from '../../core/services/work-plan.service';
import { Activity, WorkPlanInput } from '../../core/models/work-plan.model';
import { fiscalYearRangeLabel, formatDateShort, formatMonthYearThai } from '../../shared/utils/date.util';
import { todoProgress } from '../../shared/utils/activity.util';
import { uid } from '../../shared/utils/id.util';

/** One project: its details, and add / edit / delete for its activities and their to-do lists. */
@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [RouterLink, Toolbar, StatusBadge, ConfirmDialog, PlanFormDialog, ActivityFormDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-toolbar [showActions]="false" [showYear]="false" />

    <div class="grow overflow-auto p-4 md:p-8">
      <div class="max-w-5xl mx-auto flex flex-col gap-6">
        <a routerLink="/plans" class="w-fit text-sm font-semibold text-blue-600 hover:underline">← กลับไปรายการโครงการ</a>

        @if (plan(); as p) {
          <section class="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4">
            <div class="flex flex-wrap items-start gap-3">
              <div class="min-w-0 grow">
                <h1 class="text-xl font-bold text-slate-900">{{ p.name }}</h1>
                <p class="text-sm text-slate-500">ปีงบประมาณ {{ p.year }} ({{ fiscalRange(p.year) }})</p>
              </div>
              <app-status-badge [status]="p.status" />
              <div class="flex gap-1">
                <button type="button" class="px-2.5 py-1.5 rounded-lg text-sm font-semibold text-blue-600 hover:bg-blue-50" (click)="projectFormOpen.set(true)">
                  แก้ไขโครงการ
                </button>
                <button type="button" class="px-2.5 py-1.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50" (click)="deleteProjectOpen.set(true)">
                  ลบโครงการ
                </button>
              </div>
            </div>

            <dl class="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt class="text-xs text-slate-500">ประเภท</dt>
                <dd class="text-slate-900">{{ p.type || '–' }}</dd>
              </div>
              <div>
                <dt class="text-xs text-slate-500">ผู้รับผิดชอบ</dt>
                <dd class="text-slate-900">{{ p.responsible || '–' }}</dd>
              </div>
              <div>
                <dt class="text-xs text-slate-500">ระยะเวลา</dt>
                <dd class="text-slate-900">{{ formatMonth(p.startDate) }} – {{ formatMonth(p.endDate) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-slate-500">ความคืบหน้ากิจกรรม</dt>
                <dd class="text-slate-900">
                  @if (activities().length > 0) {
                    {{ activitiesDone() }}/{{ activities().length }} กิจกรรมเสร็จสิ้น
                  } @else {
                    –
                  }
                </dd>
              </div>
            </dl>

            @if (p.description) {
              <p class="text-sm text-slate-700 whitespace-pre-line">{{ p.description }}</p>
            }
          </section>

          <section class="flex flex-col gap-4">
            <div class="flex items-center justify-between">
              <h2 class="text-base font-bold text-slate-900">
                กิจกรรมย่อย <span class="font-normal text-slate-400">({{ activities().length }})</span>
              </h2>
              <button type="button" class="px-4 py-2 rounded-lg bg-blue-600 text-sm font-bold text-white" (click)="openAddActivity()">
                + เพิ่มกิจกรรม
              </button>
            </div>

            @for (a of activities(); track a.id) {
              <article class="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-3">
                <div class="flex flex-wrap items-start gap-3">
                  <div class="min-w-0 grow">
                    <h3 class="text-base font-bold text-slate-900">{{ a.name }}</h3>
                    <p class="text-xs text-slate-500">
                      {{ formatDate(a.startDate) }} – {{ formatDate(a.endDate) }}
                      @if (a.responsible) {
                        · ผู้รับผิดชอบ: {{ a.responsible }}
                      }
                    </p>
                  </div>
                  <app-status-badge [status]="a.status" />
                  <div class="flex gap-1">
                    <button type="button" class="px-2 py-1 rounded-lg text-sm font-semibold text-blue-600 hover:bg-blue-50" (click)="openEditActivity(a)">แก้ไข</button>
                    <button type="button" class="px-2 py-1 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50" (click)="deleteActivityTarget.set(a)">ลบ</button>
                  </div>
                </div>

                @if (a.description) {
                  <p class="text-sm text-slate-700 whitespace-pre-line">{{ a.description }}</p>
                }
                @if (a.note) {
                  <p class="text-sm text-amber-700 whitespace-pre-line">หมายเหตุ: {{ a.note }}</p>
                }

                <div class="border-t border-slate-100 pt-3 flex flex-col gap-2">
                  <div class="flex items-center gap-3">
                    <span class="text-sm font-semibold text-slate-700">To do</span>
                    @if (progress(a).total > 0) {
                      <span class="text-xs text-slate-500 tabular-nums">{{ progress(a).done }}/{{ progress(a).total }}</span>
                      <div class="grow max-w-48 h-1.5 rounded-full overflow-hidden bg-blue-100">
                        <div class="h-full rounded-full bg-blue-600" [style.width.%]="(progress(a).done / progress(a).total) * 100"></div>
                      </div>
                    }
                  </div>

                  @for (t of a.todos; track t.id) {
                    <label class="flex items-start gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        class="mt-0.5 w-4 h-4 shrink-0 accent-blue-600"
                        [checked]="t.done"
                        (change)="toggleTodo(a, t.id)"
                      />
                      <span [class]="t.done ? 'text-slate-400 line-through' : 'text-slate-800'">{{ t.text }}</span>
                    </label>
                  }

                  <input
                    #quick
                    type="text"
                    placeholder="+ เพิ่มรายการ to do แล้วกด Enter"
                    aria-label="เพิ่มรายการ to do"
                    class="w-full border border-dashed border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500"
                    (keydown.enter)="addTodo(a, quick.value); quick.value = ''"
                  />
                </div>
              </article>
            } @empty {
              <div class="bg-white border border-slate-200 rounded-xl px-4 py-10 text-center text-slate-400">
                ยังไม่มีกิจกรรมย่อย — กด "+ เพิ่มกิจกรรม" เพื่อแยกโครงการเป็นขั้นตอน
              </div>
            }
          </section>
        } @else {
          <div class="bg-white border border-slate-200 rounded-xl px-4 py-12 text-center text-slate-500">
            ไม่พบโครงการนี้ (อาจถูกลบไปแล้ว)
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

  readonly fiscalRange = fiscalYearRangeLabel;
  readonly formatDate = formatDateShort;
  readonly formatMonth = formatMonthYearThai;
  readonly progress = todoProgress;

  plan = computed(() => this.workPlanService.plans().find((p) => p.id === this.id()));
  activities = computed(() => this.plan()?.activities ?? []);
  activitiesDone = computed(() => this.activities().filter((a) => a.status === 'completed').length);

  projectFormOpen = signal(false);
  deleteProjectOpen = signal(false);
  activityFormOpen = signal(false);
  editingActivity = signal<Activity | null>(null);
  deleteActivityTarget = signal<Activity | null>(null);

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

  private updateTodos(activity: Activity, change: (todos: NonNullable<Activity['todos']>) => NonNullable<Activity['todos']>): void {
    const plan = this.plan();
    if (!plan) return;
    this.workPlanService.saveActivity(plan.id, { ...activity, todos: change(activity.todos ?? []) });
  }
}
