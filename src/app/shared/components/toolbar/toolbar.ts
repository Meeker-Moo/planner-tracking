import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, input, output, signal, viewChild } from '@angular/core';
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

/**
 * Laid out in one row on wide screens (brand · menu · year and actions · user); on narrow ones the menu
 * and then the year and actions drop to rows of their own.
 */
@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="shrink-0 bg-white border-b border-slate-200">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 md:px-8 py-3 lg:min-h-18">
        <div class="order-1 flex items-center gap-3 shrink-0">
          <span class="w-9 h-9 rounded-xl bg-linear-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-sm shadow-blue-600/30">
            <svg viewBox="0 0 20 20" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
              <path d="M3 8.5h14M7 3v3M13 3v3M6.5 12h3M6.5 14.5h5" stroke-linecap="round" />
            </svg>
          </span>
          <div class="flex flex-col leading-tight">
            <span class="text-[15px] md:text-base font-bold text-slate-900">ระบบโครงการประจำปี</span>
            <span class="text-[11px] text-slate-500 hidden sm:block">Annual Work Planning</span>
          </div>
        </div>

        <nav class="order-4 w-full lg:order-2 lg:w-auto flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto" aria-label="เมนูหลัก">
          @for (item of navItems; track item.link) {
            <a
              [routerLink]="item.link"
              routerLinkActive="bg-white shadow-sm text-slate-900!"
              class="inline-flex items-center gap-1.5 px-3 md:px-3.5 py-1.5 rounded-lg text-sm font-semibold text-slate-500 hover:text-slate-800 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
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

        <div class="order-2 grow lg:order-3"></div>

        @if (showYear() || showActions()) {
          <div class="order-5 w-full flex items-center justify-between gap-2 lg:order-4 lg:w-auto lg:justify-end">
            @if (showYear()) {
              <div class="flex items-center gap-2">
                <div
                  class="flex items-center rounded-xl border transition-colors"
                  [class]="isPast() ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'"
                >
                  <button
                    type="button"
                    class="w-8 h-9 flex items-center justify-center rounded-l-xl text-slate-500 hover:text-slate-900 hover:bg-slate-900/5 disabled:opacity-30 disabled:pointer-events-none outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                    aria-label="ปีงบประมาณก่อนหน้า"
                    title="ปีงบประมาณก่อนหน้า"
                    [disabled]="!hasOlder()"
                    (click)="yearChange.emit(selectedYear() - 1)"
                  >
                    <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="M12 5l-5 5 5 5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </button>
                  <label class="relative flex items-center gap-1.5 pl-1 pr-1">
                    <span class="text-xs font-medium" [class]="isPast() ? 'text-amber-700' : 'text-slate-500'">ปีงบ</span>
                    <select
                      class="appearance-none bg-transparent font-bold text-sm pr-5 py-1.5 cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                      [class]="isPast() ? 'text-amber-900' : 'text-slate-900'"
                      aria-label="ปีงบประมาณ"
                      (change)="yearChange.emit(+$any($event.target).value)"
                    >
                      @for (y of yearOptions(); track y) {
                        <option [value]="y" [selected]="y === selectedYear()">{{ y }}</option>
                      }
                    </select>
                    <svg viewBox="0 0 20 20" class="w-3.5 h-3.5 absolute right-1 pointer-events-none text-slate-400" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="M6 8l4 4 4-4" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </label>
                  <button
                    type="button"
                    class="w-8 h-9 flex items-center justify-center rounded-r-xl text-slate-500 hover:text-slate-900 hover:bg-slate-900/5 disabled:opacity-30 disabled:pointer-events-none outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                    aria-label="ปีงบประมาณถัดไป"
                    title="ปีงบประมาณถัดไป"
                    [disabled]="!hasNewer()"
                    (click)="yearChange.emit(selectedYear() + 1)"
                  >
                    <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="M8 5l5 5-5 5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </button>
                </div>
                @if (selectedYear() !== currentYear) {
                  <button
                    type="button"
                    class="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                    title="กลับไปปีงบประมาณ {{ currentYear }}"
                    (click)="yearChange.emit(currentYear)"
                  >
                    ปีปัจจุบัน
                  </button>
                }
              </div>
            }

            @if (showActions()) {
              <div class="flex items-center gap-2">
                <div class="relative" #menuRoot>
                  <button
                    type="button"
                    class="h-9 inline-flex items-center gap-1.5 px-2.5 sm:px-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                    aria-haspopup="menu"
                    [attr.aria-expanded]="menuOpen()"
                    aria-label="จัดการข้อมูล"
                    (click)="menuOpen.set(!menuOpen())"
                  >
                    <svg viewBox="0 0 20 20" class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                      <ellipse cx="10" cy="5" rx="6" ry="2.5" />
                      <path d="M4 5v10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" />
                    </svg>
                    <span class="hidden sm:inline">จัดการข้อมูล</span>
                    <svg viewBox="0 0 20 20" class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="M6 8l4 4 4-4" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </button>
                  @if (menuOpen()) {
                    <div role="menu" class="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-xl p-1 z-30">
                      <button type="button" role="menuitem" class="w-full flex items-center gap-2.5 text-left px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50" (click)="triggerImport()">
                        <svg viewBox="0 0 20 20" class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                          <path d="M10 3v9M6.5 8.5L10 12l3.5-3.5M4 14v1.5A1.5 1.5 0 005.5 17h9a1.5 1.5 0 001.5-1.5V14" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                        นำเข้า JSON
                      </button>
                      <button type="button" role="menuitem" class="w-full flex items-center gap-2.5 text-left px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50" (click)="menuOpen.set(false); exportJson.emit()">
                        <svg viewBox="0 0 20 20" class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                          <path d="M10 12V3M6.5 6.5L10 3l3.5 3.5M4 14v1.5A1.5 1.5 0 005.5 17h9a1.5 1.5 0 001.5-1.5V14" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                        ส่งออก JSON
                      </button>
                      <button type="button" role="menuitem" class="w-full flex items-center gap-2.5 text-left px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50" (click)="menuOpen.set(false); exportExcel.emit()">
                        <svg viewBox="0 0 20 20" class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                          <rect x="3.5" y="3.5" width="13" height="13" rx="2" />
                          <path d="M3.5 8h13M3.5 12h13M8 3.5v13" />
                        </svg>
                        ส่งออก Excel
                      </button>
                    </div>
                  }
                  <input #fileInput type="file" accept="application/json" class="hidden" (change)="onFileSelected($event)" />
                </div>

                <button
                  type="button"
                  class="h-9 inline-flex items-center gap-1.5 px-2.5 sm:px-4 rounded-xl bg-blue-600 text-white text-sm font-bold shadow-sm shadow-blue-600/30 hover:bg-blue-700 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                  aria-label="เพิ่มโครงการ"
                  (click)="addClick.emit()"
                >
                  <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                    <path d="M10 4.5v11M4.5 10h11" stroke-linecap="round" />
                  </svg>
                  <span class="hidden sm:inline">เพิ่มโครงการ</span>
                </button>
              </div>
            }
          </div>
        }

        <div class="order-3 lg:order-5 shrink-0">
          @if (auth.user(); as user) {
            <div class="flex items-center gap-2">
              <span class="hidden 2xl:flex items-center gap-2 text-sm font-semibold text-slate-700" [title]="user.displayName">
                <span class="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold uppercase">
                  {{ user.username.slice(0, 2) }}
                </span>
                {{ user.displayName }}
              </span>
              <button
                type="button"
                class="h-9 inline-flex items-center gap-1.5 px-2.5 sm:px-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                aria-label="ออกจากระบบ"
                title="ออกจากระบบ"
                (click)="logout()"
              >
                <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                  <path d="M12 4h2.5A1.5 1.5 0 0116 5.5v9a1.5 1.5 0 01-1.5 1.5H12M8 6.5L4.5 10 8 13.5M4.5 10H12" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <span class="hidden sm:inline lg:hidden 2xl:inline">ออกจากระบบ</span>
              </button>
            </div>
          } @else {
            <a
              routerLink="/login"
              class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold shadow-sm shadow-blue-600/30 hover:bg-blue-700 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
            >
              <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path d="M8 4H5.5A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8M12 6.5L15.5 10 12 13.5M15.5 10H8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              Login
            </a>
          }
        </div>
      </div>
    </header>
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
  readonly currentYear = currentFiscalYear();

  /** The years to choose from, newest first; always includes the selected one. */
  yearOptions = computed(() => Array.from(new Set([...this.years(), this.selectedYear()])).sort((a, b) => b - a));

  isPast = computed(() => this.selectedYear() < this.currentYear);
  hasOlder = computed(() => this.selectedYear() > Math.min(...this.yearOptions()));
  hasNewer = computed(() => this.selectedYear() < Math.max(...this.yearOptions()));

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

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menuOpen.set(false);
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
