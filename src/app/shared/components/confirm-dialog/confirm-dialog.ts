import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
        <div class="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div class="p-6 flex flex-col gap-2">
            <h2 class="text-lg font-bold text-slate-900">{{ title() }}</h2>
            <p class="text-sm text-slate-600">{{ message() }}</p>
          </div>
          <div class="px-6 pb-6 flex justify-end gap-3">
            <button
              type="button"
              class="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700"
              (click)="cancel.emit()"
            >
              {{ cancelText() }}
            </button>
            <button
              type="button"
              class="px-4 py-2 rounded-lg bg-blue-600 text-sm font-bold text-white"
              (click)="confirm.emit()"
            >
              {{ confirmText() }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmDialog {
  open = input(false);
  title = input('ยืนยันการทำรายการ');
  message = input('');
  confirmText = input('ยืนยัน');
  cancelText = input('ยกเลิก');

  confirm = output<void>();
  cancel = output<void>();
}
