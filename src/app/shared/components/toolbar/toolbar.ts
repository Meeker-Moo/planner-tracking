import { ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, input, output, signal, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { currentFiscalYear } from '../../utils/date.util';

/** The main menu; locked pages need a login (see app.routes.ts) and show a lock until then. */
const NAV_ITEMS = [
  { link: '/excel', label: 'Excel', locked: false },
  { link: '/dashboard', label: 'Dashboard', locked: true },
  { link: '/plans', label: 'รายการโครงการ', locked: true },
  { link: '/timeline', label: 'Timeline', locked: true },
  { link: '/monthly-report', label: 'Monthly Report', locked: true },
];

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

        <nav class="flex gap-1 bg-slate-100 p-1 rounded-lg shrink-0 overflow-x-auto max-w-full">
          @for (item of navItems; track item.link) {
            <a
              [routerLink]="item.link"
              routerLinkActive="bg-white shadow-sm text-slate-900"
              class="inline-flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-md text-sm font-semibold text-slate-500 whitespace-nowrap"
              [class.opacity-60]="item.locked && !auth.isLoggedIn()"
              [title]="item.locked && !auth.isLoggedIn() ? 'ต้องเข้าสู่ระบบก่อน' : ''"
            >
              @if (item.locked && !auth.isLoggedIn()) {
                <svg viewBox="0 0 20 20" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.8" aria-label="ต้องเข้าสู่ระบบ">
                  <rect x="4.5" y="9" width="11" height="8" rx="2" />
                  <path d="M7 9V6.5a3 3 0 016 0V9" stroke-linecap="round" />
                </svg>
              }
              {{ item.label }}
            </a>
          }
        </nav>

        <div class="flex-grow"></div>

        @if (auth.user(); as user) {
          <div class="flex items-center gap-2 shrink-0">
            <span class="hidden lg:flex items-center gap-2 text-sm font-semibold text-slate-700">
              <span class="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold uppercase">
                {{ user.username.slice(0, 2) }}
              </span>
              {{ user.displayName }}
            </span>
            <button
              type="button"
              class="px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 whitespace-nowrap"
              (click)="logout()"
            >
              ออกจากระบบ
            </button>
          </div>
        } @else {
          <a
            routerLink="/login"
            class="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold shadow-sm shadow-blue-600/30 hover:bg-blue-700 whitespace-nowrap"
          >
            <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M8 4H5.5A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8M12 6.5L15.5 10 12 13.5M15.5 10H8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            Login
          </a>
        }

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

  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly navItems = NAV_ITEMS;

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/excel');
  }

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
