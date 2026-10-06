import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Activity, TodoItem, WorkStatus } from '../../../core/models/work-plan.model';
import { STATUS_LIST, STATUS_MAP } from '../../../core/models/status.constant';
import { ThaiDatePicker } from '../../../shared/components/thai-date-picker/thai-date-picker';
import { ResponsiblePicker, resolveResponsible, responsibleValue } from '../../../shared/components/responsible-picker/responsible-picker';
import { UserStore } from '../../../core/auth/user-store.service';
import { AuthService } from '../../../core/auth/auth.service';
import { canUseProjects } from '../../../core/auth/permissions';
import { formatDateShort } from '../../../shared/utils/date.util';
import { uid } from '../../../shared/utils/id.util';
import { daysBetween, quarterOf } from '../project-detail.util';

/**
 * Add or edit one activity of a project, including its to-do list. A bottom sheet on phones, a centred dialog otherwise.
 * With `statusOnly` (the account is responsible for the activity but may not edit the project) only the status,
 * the note and the ticks of the to-dos can be changed.
 */
@Component({
  selector: 'app-activity-form-dialog',
  standalone: true,
  imports: [FormsModule, ThaiDatePicker, ResponsiblePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div
        class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4"
        (keydown.escape)="onEscape($event)"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="activity-form-title"
          class="w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[90vh] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          <div class="px-5 sm:px-6 py-4 border-b border-slate-200 flex items-center gap-3 shrink-0">
            <span class="w-10 h-10 shrink-0 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <svg viewBox="0 0 20 20" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                @if (editing()) {
                  <path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z" stroke-linejoin="round" />
                } @else {
                  <path d="M10 4.5v11M4.5 10h11" stroke-linecap="round" />
                }
              </svg>
            </span>
            <div class="min-w-0 grow">
              <h2 id="activity-form-title" class="text-lg font-bold text-slate-900">
                {{ statusOnly() ? 'เปลี่ยนสถานะกิจกรรม' : editing() ? 'แก้ไขกิจกรรม' : 'เพิ่มกิจกรรมใหม่' }}
              </h2>
              @if (projectName()) {
                <p class="text-xs text-slate-500 truncate">โครงการ: {{ projectName() }}</p>
              }
            </div>
            <button
              type="button"
              aria-label="ปิด"
              class="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
              (click)="cancel.emit()"
            >
              <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M5 5l10 10M15 5L5 15" stroke-linecap="round" />
              </svg>
            </button>
          </div>

          <div class="px-5 sm:px-6 py-5 flex flex-col gap-6 overflow-y-auto">
            @if (statusOnly()) {
              <div class="flex flex-col gap-2">
                <span class="text-base font-bold text-slate-900">{{ name() }}</span>
                <span class="text-sm text-slate-600">{{ formatDate(startDate()) }} – {{ formatDate(endDate()) }}</span>
                <p class="text-xs text-blue-800 bg-blue-50 ring-1 ring-blue-200 rounded-xl px-3 py-2">
                  คุณเป็นผู้รับผิดชอบกิจกรรมนี้ จึงเปลี่ยนได้เฉพาะสถานะ หมายเหตุ และติ๊ก to do ส่วนรายละเอียดอื่นแก้ได้โดยผู้สร้างโครงการหรือ Admin
                </p>
              </div>
            } @else {
              <!-- What -->
              <div class="flex flex-col gap-4">
                <label class="flex flex-col gap-1.5">
                  <span class="text-sm font-semibold text-slate-700">ชื่อกิจกรรม <span class="text-red-500">*</span></span>
                  <input
                    #nameInput
                    type="text"
                    required
                    placeholder="เช่น อบรมรุ่นที่ 1"
                    class="border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    [(ngModel)]="name"
                  />
                </label>
                <div class="flex flex-col gap-1.5">
                  <span class="text-sm font-semibold text-slate-700">ผู้รับผิดชอบ</span>
                  <app-responsible-picker
                    ariaLabel="ผู้รับผิดชอบกิจกรรม"
                    [value]="responsible()"
                    [legacyName]="editing()?.responsibleId ? '' : (editing()?.responsible ?? '')"
                    (valueChange)="responsible.set($event)"
                  />
                </div>
              </div>

              <!-- When -->
              <div class="flex flex-col gap-2">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div class="flex flex-col gap-1.5">
                    <span class="text-sm font-semibold text-slate-700">วันที่เริ่ม <span class="text-red-500">*</span></span>
                    <app-thai-date-picker ariaLabel="วันที่เริ่มกิจกรรม" [value]="startDate()" (valueChange)="onStartChange($event)" />
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <span class="text-sm font-semibold text-slate-700">วันที่สิ้นสุด <span class="text-red-500">*</span></span>
                    <app-thai-date-picker ariaLabel="วันที่สิ้นสุดกิจกรรม" [value]="endDate()" (valueChange)="onEndChange($event)" />
                  </div>
                </div>
                @if (duration(); as d) {
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span class="inline-flex items-center gap-1.5 rounded-md bg-slate-100 text-slate-600 font-medium px-2 py-1">
                      <svg viewBox="0 0 20 20" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                        <circle cx="10" cy="10" r="7" /><path d="M10 6.5V10l2.5 1.5" stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                      รวม {{ d }} วัน
                    </span>
                    @if (quarterText()) {
                      <span class="inline-flex items-center rounded-md bg-blue-50 text-blue-700 font-medium px-2 py-1">{{ quarterText() }}</span>
                    }
                    @if (outsideProject()) {
                      <span class="inline-flex items-center gap-1.5 text-amber-700">
                        <svg viewBox="0 0 20 20" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                          <path d="M10 3.5l7 12.5H3L10 3.5z" stroke-linejoin="round" /><path d="M10 8.5v3M10 14h.01" stroke-linecap="round" />
                        </svg>
                        อยู่นอกช่วงของโครงการ ({{ formatDate(defaultStart()) }} – {{ formatDate(defaultEnd()) }})
                      </span>
                    }
                  </div>
                }
              </div>
            }

            <!-- Status -->
            <div class="flex flex-col gap-2">
              <span class="text-sm font-semibold text-slate-700">สถานะ</span>
              <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="สถานะ">
                @for (s of statusList; track s.value) {
                  <button
                    type="button"
                    role="radio"
                    class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                    [style.background]="status() === s.value ? s.bg : '#FFFFFF'"
                    [style.color]="status() === s.value ? s.text : '#64748B'"
                    [style.border-color]="status() === s.value ? s.dot : '#E2E8F0'"
                    [attr.aria-checked]="status() === s.value"
                    (click)="status.set(s.value)"
                  >
                    <span class="w-2 h-2 rounded-full" [style.background]="s.dot"></span>
                    {{ s.label }}
                  </button>
                }
              </div>
              @if (statusChanged() || note() || noteOpen()) {
                <label class="mt-1 flex flex-col gap-1.5">
                  <span class="text-sm font-semibold text-slate-700">หมายเหตุ</span>
                  @if (statusChanged()) {
                    <span class="text-xs text-amber-700">
                      เปลี่ยนสถานะจาก "{{ statusLabel(originalStatus()) }}" เป็น "{{ statusLabel(status()) }}" — ควรระบุเหตุผล
                    </span>
                  }
                  <textarea
                    rows="2"
                    placeholder="เช่น เหตุผลที่เลื่อน / ยกเลิก"
                    class="border rounded-lg px-3 py-2.5 text-sm outline-none resize-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    [class]="statusChanged() && !note().trim() ? 'border-amber-400 bg-amber-50/40' : 'border-slate-200'"
                    [(ngModel)]="note"
                  ></textarea>
                </label>
              } @else {
                <button type="button" class="w-fit text-sm font-semibold text-blue-600 hover:text-blue-700" (click)="showNote()">+ เพิ่มหมายเหตุ</button>
              }
            </div>

            @if (!statusOnly()) {
              <label class="flex flex-col gap-1.5">
                <span class="text-sm font-semibold text-slate-700">รายละเอียด</span>
                <textarea
                  rows="3"
                  placeholder="รายละเอียดของกิจกรรม (ถ้ามี)"
                  class="border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none resize-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  [(ngModel)]="description"
                ></textarea>
              </label>
            }

            <!-- To-do list -->
            <div class="flex flex-col gap-2 rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3.5">
              <div class="flex items-center gap-3">
                <span class="text-sm font-semibold text-slate-700">To do ย่อย</span>
                @if (todos().length) {
                  <span class="text-xs text-slate-500 tabular-nums">{{ doneCount() }}/{{ todos().length }} เสร็จแล้ว</span>
                  <div class="grow max-w-40 h-1.5 rounded-full bg-white ring-1 ring-slate-200 overflow-hidden">
                    <div class="h-full rounded-full bg-emerald-500" [style.width.%]="(doneCount() / todos().length) * 100"></div>
                  </div>
                }
              </div>

              @for (t of todos(); track t.id) {
                <div class="flex items-center gap-2">
                  <input
                    type="checkbox"
                    class="w-4 h-4 shrink-0 accent-emerald-600"
                    [attr.aria-label]="'ทำเสร็จแล้ว: ' + t.text"
                    [checked]="t.done"
                    (change)="patchTodo(t.id, { done: $any($event.target).checked })"
                  />
                  @if (statusOnly()) {
                    <span class="flex-1 min-w-0 text-sm" [class]="t.done ? 'line-through text-slate-400' : 'text-slate-800'">{{ t.text }}</span>
                  } @else {
                    <input
                      type="text"
                      aria-label="รายการ to do"
                      class="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                      [class.line-through]="t.done"
                      [class.text-slate-400]="t.done"
                      [ngModel]="t.text"
                      (ngModelChange)="patchTodo(t.id, { text: $event })"
                    />
                    <button
                      type="button"
                      [attr.aria-label]="'ลบ ' + t.text"
                      title="ลบรายการนี้"
                      class="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-600 outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
                      (click)="removeTodo(t.id)"
                    >
                      <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                        <path d="M4 6h12M8 6V4.5h4V6M6 6l.7 10h6.6L14 6" stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                    </button>
                  }
                </div>
              } @empty {
                @if (statusOnly()) {
                  <p class="text-xs text-slate-500">ไม่มีรายการ to do</p>
                }
              }

              @if (!statusOnly()) {
                <div class="flex gap-2">
                  <input
                    type="text"
                    placeholder="พิมพ์รายการ to do แล้วกด Enter"
                    aria-label="เพิ่มรายการ to do"
                    class="flex-1 min-w-0 bg-white border border-dashed border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 focus:border-solid"
                    [ngModel]="newTodo()"
                    (ngModelChange)="newTodo.set($event)"
                    (keydown.enter)="addTodo(); $event.preventDefault()"
                  />
                  <button
                    type="button"
                    class="px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-semibold text-blue-600 hover:bg-blue-50 disabled:opacity-40 disabled:hover:bg-white"
                    [disabled]="!newTodo().trim()"
                    (click)="addTodo()"
                  >
                    + เพิ่ม
                  </button>
                </div>
              }
            </div>
          </div>

          <div class="px-5 sm:px-6 py-4 border-t border-slate-200 bg-slate-50/60 flex flex-col-reverse sm:flex-row sm:items-center gap-2 sm:gap-3 shrink-0">
            <span class="hidden sm:block grow text-xs text-slate-400">
              @if (!statusOnly()) {
                <span class="text-red-500">*</span> จำเป็นต้องกรอก
              }
            </span>
            <button
              type="button"
              class="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
              (click)="cancel.emit()"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              class="px-5 py-2.5 rounded-xl bg-blue-600 text-sm font-bold text-white shadow-sm shadow-blue-600/30 hover:bg-blue-700 disabled:opacity-40 disabled:shadow-none disabled:hover:bg-blue-600"
              [disabled]="!canSave()"
              [title]="canSave() ? '' : 'กรุณาใส่ชื่อกิจกรรมและวันที่'"
              (click)="onSave()"
            >
              {{ statusOnly() ? 'บันทึกสถานะ' : editing() ? 'บันทึกการแก้ไข' : 'เพิ่มกิจกรรม' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ActivityFormDialog {
  open = input(false);
  /** The activity being edited; null when adding a new one. */
  editing = input<Activity | null>(null);
  /** The project's own range: a new activity starts with it, and dates outside it are pointed out. */
  defaultStart = input('');
  defaultEnd = input('');
  /** Shown under the title. */
  projectName = input('');
  /** Only the status, the note and the to-do ticks may change (see WorkPlanService.saveActivity). */
  statusOnly = input(false);

  save = output<Activity>();
  cancel = output<void>();

  readonly statusList = STATUS_LIST;
  readonly formatDate = formatDateShort;

  name = signal('');
  /** The picker's value: an account id, '' for nobody, or the old typed-in name (see ResponsiblePicker). */
  responsible = signal('');
  status = signal<WorkStatus>('planned');

  private readonly users = inject(UserStore);
  private readonly auth = inject(AuthService);
  description = signal('');
  startDate = signal('');
  endDate = signal('');
  note = signal('');
  todos = signal<TodoItem[]>([]);
  newTodo = signal('');
  /** The note box is shown once asked for, or when the status changes or a note is already there. */
  noteOpen = signal(false);

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  doneCount = computed(() => this.todos().filter((t) => t.done).length);

  canSave = computed(() => !!this.name().trim() && !!this.startDate() && !!this.endDate());

  /** Days from the start to the end date, both counted. */
  duration = computed(() => {
    const days = daysBetween(this.startDate(), this.endDate());
    return days === null || days < 0 ? null : days + 1;
  });

  /** "ไตรมาส 1/2570", or "ไตรมาส 4/2569 – 1/2570" for dates across quarters. */
  quarterText = computed(() => {
    const first = quarterOf(this.startDate());
    const last = quarterOf(this.endDate());
    if (!first || !last) return '';
    const name = (q: NonNullable<typeof first>) => `${q.quarter}/${q.fiscalYear}`;
    return name(first) === name(last) ? `ไตรมาส ${name(first)}` : `ไตรมาส ${name(first)} – ${name(last)}`;
  });

  outsideProject = computed(() => {
    const [start, end] = [this.defaultStart(), this.defaultEnd()];
    return !!start && !!end && (this.startDate() < start || this.endDate() > end);
  });

  /** The status the activity had when the dialog was opened; undefined for a new one. */
  originalStatus = computed(() => this.editing()?.status);
  statusChanged = computed(() => {
    const original = this.originalStatus();
    return !!original && original !== this.status();
  });

  constructor() {
    // Start typing the name as soon as the dialog opens.
    effect(() => {
      if (this.open() && !this.statusOnly()) this.nameInput()?.nativeElement.focus();
    });
    effect(() => {
      if (!this.open()) return;
      const a = this.editing();
      this.newTodo.set('');
      this.noteOpen.set(false);
      if (a) {
        this.name.set(a.name);
        this.responsible.set(responsibleValue(a));
        this.status.set(a.status);
        this.description.set(a.description ?? '');
        this.startDate.set(a.startDate);
        this.endDate.set(a.endDate);
        this.note.set(a.note ?? '');
        this.todos.set((a.todos ?? []).map((t) => ({ ...t })));
      } else {
        this.name.set('');
        // A new activity starts out as the responsibility of whoever adds it.
        const me = this.auth.user();
        this.responsible.set(canUseProjects(me) ? me.id : '');
        this.status.set('planned');
        this.description.set('');
        this.startDate.set(this.defaultStart());
        this.endDate.set(this.defaultEnd());
        this.note.set('');
        this.todos.set([]);
      }
    });
  }

  /** Escape closes the dialog, unless it is closing a date picker's calendar. */
  onEscape(event: Event): void {
    if ((event.target as HTMLElement).closest('app-thai-date-picker')) return;
    this.cancel.emit();
  }

  showNote(): void {
    this.noteOpen.set(true);
  }

  statusLabel(status: WorkStatus | undefined): string {
    return status ? (STATUS_MAP[status]?.label ?? status) : '';
  }

  // Keeps the range valid: moving the start past the end pushes the end along, and the other way round.
  onStartChange(value: string): void {
    this.startDate.set(value);
    if (this.endDate() < value) this.endDate.set(value);
  }

  onEndChange(value: string): void {
    this.endDate.set(value);
    if (this.startDate() > value) this.startDate.set(value);
  }

  addTodo(): void {
    const text = this.newTodo().trim();
    if (!text) return;
    this.todos.update((list) => [...list, { id: uid(), text, done: false }]);
    this.newTodo.set('');
  }

  patchTodo(id: string, patch: Partial<TodoItem>): void {
    this.todos.update((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  removeTodo(id: string): void {
    this.todos.update((list) => list.filter((t) => t.id !== id));
  }

  /** The chosen responsible account and its name, the old name, or neither. */
  private responsibleFields(): Pick<Activity, 'responsibleId' | 'responsible'> {
    const { responsibleId, responsible } = resolveResponsible(
      this.responsible(),
      this.editing()?.responsible ?? '',
      (id) => this.users.getById(id)?.displayName,
    );
    return { responsibleId, responsible: responsible.trim() || undefined };
  }

  onSave(): void {
    const name = this.name().trim();
    if (!this.canSave()) return;
    this.addTodo(); // a to-do typed but not yet added is kept rather than lost
    const clean = (text: string) => text.trim() || undefined;
    // Items left blank are dropped.
    const todos = this.todos()
      .map((t) => ({ ...t, text: t.text.trim() }))
      .filter((t) => t.text);
    this.save.emit({
      id: this.editing()?.id ?? uid(),
      name,
      ...this.responsibleFields(),
      description: clean(this.description()),
      startDate: this.startDate(),
      endDate: this.endDate(),
      status: this.status(),
      note: clean(this.note()),
      todos: todos.length ? todos : undefined,
    });
  }
}
