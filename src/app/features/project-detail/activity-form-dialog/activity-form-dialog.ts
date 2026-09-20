import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Activity, TodoItem, WorkStatus } from '../../../core/models/work-plan.model';
import { STATUS_LIST, STATUS_MAP } from '../../../core/models/status.constant';
import { ThaiDatePicker } from '../../../shared/components/thai-date-picker/thai-date-picker';
import { uid } from '../../../shared/utils/id.util';

/** Add or edit one activity of a project, including its to-do list. */
@Component({
  selector: 'app-activity-form-dialog',
  standalone: true,
  imports: [FormsModule, ThaiDatePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
        <div class="w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div class="px-6 py-5 border-b border-slate-200 flex items-center justify-between shrink-0">
            <span class="text-lg font-bold text-slate-900">{{ editing() ? 'แก้ไขกิจกรรม' : 'เพิ่มกิจกรรมใหม่' }}</span>
            <button
              type="button"
              aria-label="ปิด"
              class="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 text-base"
              (click)="cancel.emit()"
            >
              ×
            </button>
          </div>

          <div class="p-6 flex flex-col gap-4 overflow-y-auto">
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-semibold text-slate-700">ชื่อกิจกรรม</span>
              <input
                type="text"
                placeholder="เช่น อบรมรุ่นที่ 1"
                class="border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                [(ngModel)]="name"
              />
            </label>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label class="flex flex-col gap-1.5">
                <span class="text-sm font-semibold text-slate-700">ผู้รับผิดชอบ</span>
                <input
                  type="text"
                  placeholder="เช่น นายสมชาย"
                  class="border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                  [(ngModel)]="responsible"
                />
              </label>
              <label class="flex flex-col gap-1.5">
                <span class="text-sm font-semibold text-slate-700">สถานะ</span>
                <select
                  class="border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                  [(ngModel)]="status"
                >
                  @for (s of statusList; track s.value) {
                    <option [value]="s.value">{{ s.label }}</option>
                  }
                </select>
              </label>
            </div>

            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-semibold text-slate-700">รายละเอียด</span>
              <textarea
                rows="3"
                placeholder="รายละเอียดของกิจกรรม (ถ้ามี)"
                class="border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none resize-none focus:border-blue-500"
                [(ngModel)]="description"
              ></textarea>
            </label>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="flex flex-col gap-1.5">
                <span class="text-sm font-semibold text-slate-700">วันที่เริ่ม</span>
                <app-thai-date-picker ariaLabel="วันที่เริ่มกิจกรรม" [value]="startDate()" (valueChange)="onStartChange($event)" />
              </div>
              <div class="flex flex-col gap-1.5">
                <span class="text-sm font-semibold text-slate-700">วันที่สิ้นสุด</span>
                <app-thai-date-picker ariaLabel="วันที่สิ้นสุดกิจกรรม" [value]="endDate()" (valueChange)="onEndChange($event)" />
              </div>
            </div>

            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-semibold text-slate-700">หมายเหตุ (กรณีเปลี่ยนสถานะ)</span>
              <input
                type="text"
                placeholder="เช่น เหตุผลที่เลื่อน / ยกเลิก"
                class="border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                [class]="statusChanged() && !note().trim() ? 'border-amber-400' : 'border-slate-200'"
                [(ngModel)]="note"
              />
              @if (statusChanged()) {
                <span class="text-xs text-amber-700">
                  เปลี่ยนสถานะจาก "{{ statusLabel(originalStatus()) }}" เป็น "{{ statusLabel(status()) }}" — ควรระบุหมายเหตุ
                </span>
              }
            </label>

            <div class="flex flex-col gap-2.5">
              <span class="text-sm font-semibold text-slate-700">
                To do ย่อย <span class="font-normal text-slate-400">({{ doneCount() }}/{{ todos().length }} เสร็จแล้ว)</span>
              </span>

              @for (t of todos(); track t.id) {
                <div class="flex items-center gap-2">
                  <input
                    type="checkbox"
                    class="w-4 h-4 shrink-0 accent-blue-600"
                    aria-label="ทำเสร็จแล้ว"
                    [checked]="t.done"
                    (change)="patchTodo(t.id, { done: $any($event.target).checked })"
                  />
                  <input
                    type="text"
                    aria-label="รายการ to do"
                    class="flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                    [class.line-through]="t.done"
                    [class.text-slate-400]="t.done"
                    [ngModel]="t.text"
                    (ngModelChange)="patchTodo(t.id, { text: $event })"
                  />
                  <button
                    type="button"
                    aria-label="ลบรายการนี้"
                    class="w-8 h-8 shrink-0 rounded-lg text-lg text-red-600 hover:bg-red-50"
                    (click)="removeTodo(t.id)"
                  >
                    ×
                  </button>
                </div>
              }

              <div class="flex gap-2">
                <input
                  type="text"
                  placeholder="พิมพ์รายการ to do แล้วกด Enter"
                  aria-label="เพิ่มรายการ to do"
                  class="flex-1 min-w-0 border border-dashed border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                  [ngModel]="newTodo()"
                  (ngModelChange)="newTodo.set($event)"
                  (keydown.enter)="addTodo(); $event.preventDefault()"
                />
                <button
                  type="button"
                  class="px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-blue-600 hover:bg-blue-50"
                  (click)="addTodo()"
                >
                  + เพิ่ม
                </button>
              </div>
            </div>
          </div>

          <div class="px-6 py-4 border-t border-slate-200 flex justify-end gap-3 shrink-0">
            <button
              type="button"
              class="px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700"
              (click)="cancel.emit()"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              class="px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-bold text-white disabled:opacity-40"
              [disabled]="!name().trim() || !startDate() || !endDate()"
              (click)="onSave()"
            >
              บันทึกกิจกรรม
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
  /** Dates a new activity starts with (the project's own range). */
  defaultStart = input('');
  defaultEnd = input('');

  save = output<Activity>();
  cancel = output<void>();

  readonly statusList = STATUS_LIST;

  name = signal('');
  responsible = signal('');
  status = signal<WorkStatus>('planned');
  description = signal('');
  startDate = signal('');
  endDate = signal('');
  note = signal('');
  todos = signal<TodoItem[]>([]);
  newTodo = signal('');

  doneCount = computed(() => this.todos().filter((t) => t.done).length);

  /** The status the activity had when the dialog was opened; undefined for a new one. */
  originalStatus = computed(() => this.editing()?.status);
  statusChanged = computed(() => {
    const original = this.originalStatus();
    return !!original && original !== this.status();
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const a = this.editing();
      this.newTodo.set('');
      if (a) {
        this.name.set(a.name);
        this.responsible.set(a.responsible ?? '');
        this.status.set(a.status);
        this.description.set(a.description ?? '');
        this.startDate.set(a.startDate);
        this.endDate.set(a.endDate);
        this.note.set(a.note ?? '');
        this.todos.set((a.todos ?? []).map((t) => ({ ...t })));
      } else {
        this.name.set('');
        this.responsible.set('');
        this.status.set('planned');
        this.description.set('');
        this.startDate.set(this.defaultStart());
        this.endDate.set(this.defaultEnd());
        this.note.set('');
        this.todos.set([]);
      }
    });
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

  onSave(): void {
    const name = this.name().trim();
    if (!name || !this.startDate() || !this.endDate()) return;
    this.addTodo(); // a to-do typed but not yet added is kept rather than lost
    const clean = (text: string) => text.trim() || undefined;
    // Items left blank are dropped.
    const todos = this.todos()
      .map((t) => ({ ...t, text: t.text.trim() }))
      .filter((t) => t.text);
    this.save.emit({
      id: this.editing()?.id ?? uid(),
      name,
      responsible: clean(this.responsible()),
      description: clean(this.description()),
      startDate: this.startDate(),
      endDate: this.endDate(),
      status: this.status(),
      note: clean(this.note()),
      todos: todos.length ? todos : undefined,
    });
  }
}
