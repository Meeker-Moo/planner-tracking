import { ChangeDetectionStrategy, Component, ElementRef, HostListener, input, output, signal, viewChild } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { currentFiscalYear } from '../../utils/date.util';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex-shrink-0 bg-white border-b border-slate-200">
      <div class="h-[72px] flex items-center px-4 md:px-8 gap-4 md:gap-7">
        <div class="flex flex-col leading-tight shrink-0">
          <span class="text-base md:text-[17px] font-bold text-slate-900">ระบบโครงการประจำปี</span>
          <span class="text-[11px] text-slate-500 hidden sm:block">Annual Work Planning</span>
        </div>

        <nav class="flex gap-1 bg-slate-100 p-1 rounded-lg shrink-0">
          <a
            routerLink="/dashboard"
            routerLinkActive="bg-white shadow-sm text-slate-900"
            class="px-3 md:px-4 py-2 rounded-md text-sm font-semibold text-slate-500 whitespace-nowrap"
          >
            Dashboard
          </a>
          <a
            routerLink="/plans"
            routerLinkActive="bg-white shadow-sm text-slate-900"
            class="px-3 md:px-4 py-2 rounded-md text-sm font-semibold text-slate-500 whitespace-nowrap"
          >
            รายการโครงการ
          </a>
          <a
            routerLink="/timeline"
            routerLinkActive="bg-white shadow-sm text-slate-900"
            class="px-3 md:px-4 py-2 rounded-md text-sm font-semibold text-slate-500 whitespace-nowrap"
          >
            Timeline
          </a>
          <a
            routerLink="/monthly-report"
            routerLinkActive="bg-white shadow-sm text-slate-900"
            class="px-3 md:px-4 py-2 rounded-md text-sm font-semibold text-slate-500 whitespace-nowrap"
          >
            Monthly Report
          </a>
        </nav>

        <div class="flex-grow"></div>

        @if (showYear()) {
        <label class="hidden md:flex items-center gap-2 text-sm font-semibold text-slate-700 border border-slate-200 rounded-lg px-3 py-2">
          ปีงบประมาณ
          <select
            class="bg-transparent outline-none font-semibold"
            (change)="yearChange.emit(+$any($event.target).value)"
          >
            @for (y of years(); track y) {
              <option [value]="y" [selected]="y === selectedYear()">{{ y }}</option>
            }
          </select>
        </label>
        }

        @if (showActions()) {
        <div class="relative" #menuRoot>
          <button
            type="button"
            class="px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700"
            (click)="menuOpen.set(!menuOpen())"
          >
            จัดการข้อมูล ▾
          </button>
          @if (menuOpen()) {
            <div class="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden z-20">
              <button
                type="button"
                class="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                (click)="triggerImport()"
              >
                นำเข้า JSON
              </button>
              <button
                type="button"
                class="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                (click)="menuOpen.set(false); exportJson.emit()"
              >
                ส่งออก JSON
              </button>
              <button
                type="button"
                class="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                (click)="menuOpen.set(false); exportExcel.emit()"
              >
                ส่งออก Excel
              </button>
            </div>
          }
          <input
            #fileInput
            type="file"
            accept="application/json"
            class="hidden"
            (change)="onFileSelected($event)"
          />
        </div>

        <button
          type="button"
          class="px-3 md:px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold whitespace-nowrap"
          (click)="addClick.emit()"
        >
          + เพิ่มโครงการ
        </button>
        }
      </div>
    </div>
  `,
})
export class Toolbar {
  years = input<number[]>([]);
  selectedYear = input<number>(currentFiscalYear());
  /** Show the data menu and the add button; off for read-only pages such as the dashboard. */
  showActions = input(true);
  /** Show the fiscal-year selector; off for pages that are about a single project. */
  showYear = input(true);

  yearChange = output<number>();
  addClick = output<void>();
  importJson = output<File>();
  exportJson = output<void>();
  exportExcel = output<void>();

  menuOpen = signal(false);

  private readonly menuRoot = viewChild<ElementRef<HTMLElement>>('menuRoot');
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const root = this.menuRoot()?.nativeElement;
    if (root && !root.contains(event.target as Node)) {
      this.menuOpen.set(false);
    }
  }

  triggerImport(): void {
    this.menuOpen.set(false);
    this.fileInput()?.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.importJson.emit(file);
    }
    input.value = '';
  }
}
