import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { canManageUsers, canUseEvents, canUseProjects } from '../../../core/auth/permissions';
import { UserStore } from '../../../core/auth/user-store.service';
import { ROLE_BADGE_CLASS, ROLE_LABELS } from '../../../core/auth/user.model';
import { DataScopeService } from '../../../core/services/data-scope.service';
import { ExcelExportService } from '../../../core/services/excel-export.service';
import { currentFiscalYear } from '../../utils/date.util';

/**
 * The main menu of the planning system. Its pages need a login (see app.routes.ts), so it is hidden until then;
 * once signed in, each account sees the pages of its role: Super Admin only the user management, a User no
 * Monthly Report. Excel Compare is a separate, public tool with its own button beside the account.
 */
const NAV_ITEMS: { link: string; label: string; area: 'projects' | 'events' | 'users' }[] = [
  { link: '/dashboard', label: 'Dashboard', area: 'projects' },
  { link: '/plans', label: 'รายการโครงการ', area: 'projects' },
  { link: '/timeline', label: 'Timeline', area: 'projects' },
  { link: '/monthly-report', label: 'Monthly Report', area: 'events' },
  { link: '/users', label: 'จัดการผู้ใช้', area: 'users' },
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

        @if (navItems().length) {
          <nav class="order-4 w-full lg:order-2 lg:w-auto flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto" aria-label="เมนูหลัก">
            @for (item of navItems(); track item.link) {
              <a
                [routerLink]="item.link"
                routerLinkActive="bg-white shadow-sm text-slate-900!"
                class="inline-flex items-center px-3 md:px-3.5 py-1.5 rounded-lg text-sm font-semibold text-slate-500 hover:text-slate-800 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
              >
                {{ item.label }}
              </a>
            }
          </nav>
        }

        <div class="order-2 grow lg:order-3"></div>

        @if (showYear() || showActions() || ownerFilterVisible()) {
          <!-- Own row under the menu (a strip with a hairline above); in line with it only on very wide screens. -->
          <div
            class="order-5 w-full flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 min-[1800px]:order-4 min-[1800px]:w-auto min-[1800px]:border-0 min-[1800px]:pt-0"
          >
            <div class="flex flex-wrap items-center gap-2">
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
              @if (ownerFilterVisible()) {
                <label class="relative h-9 flex items-center gap-1.5 pl-3 pr-1 rounded-xl border border-slate-200 bg-white" title="เลือกดูข้อมูลของผู้ใช้">
                  <span class="text-xs font-medium text-slate-500 whitespace-nowrap">ข้อมูลของ</span>
                  <select
                    class="appearance-none bg-transparent font-semibold text-sm text-slate-800 pr-5 py-1 max-w-36 truncate cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                    aria-label="ดูข้อมูลของ"
                    (change)="scope.setOwnerFilter($any($event.target).value)"
                  >
                    <option value="all" [selected]="scope.ownerFilter() === 'all'">ทุกคน</option>
                    @for (u of filterUsers(); track u.id) {
                      <option [value]="u.id" [selected]="scope.ownerFilter() === u.id">{{ u.displayName }}{{ u.active ? '' : ' (ปิดใช้งาน)' }}</option>
                    }
                  </select>
                  <svg viewBox="0 0 20 20" class="w-3.5 h-3.5 absolute right-2 pointer-events-none text-slate-400" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M6 8l4 4 4-4" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </label>
              }
            </div>

            @if (showActions()) {
              <div class="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  class="h-9 inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 hover:border-emerald-300 whitespace-nowrap disabled:opacity-60 disabled:cursor-wait outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                  [disabled]="excel.busy()"
                  [attr.aria-busy]="excel.busy()"
                  aria-label="ส่งออก Excel"
                  title="ส่งออกโครงการที่แสดงอยู่เป็นไฟล์ Excel (.xlsx) พร้อมภาพ Timeline"
                  (click)="exportExcel.emit()"
                >
                  @if (excel.busy()) {
                    <svg viewBox="0 0 20 20" class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                      <path d="M10 3a7 7 0 107 7" stroke-linecap="round" />
                    </svg>
                  } @else {
                    <svg viewBox="0 0 20 20" class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                      <rect x="3" y="3" width="14" height="14" rx="2.5" />
                      <path d="M7 7l6 6M13 7l-6 6" stroke-linecap="round" />
                    </svg>
                  }
                  <span class="hidden sm:inline">{{ excel.busy() ? 'กำลังส่งออก…' : 'ส่งออก Excel' }}</span>
                </button>

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

        <div class="order-3 lg:order-4 min-[1800px]:order-5 shrink-0 flex items-center gap-2">
          <a
            routerLink="/excel"
            routerLinkActive="border-emerald-300! bg-emerald-50 text-emerald-800!"
            class="h-9 inline-flex items-center gap-1.5 px-2.5 xl:px-3 rounded-xl border border-dashed border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
            title="Excel Compare — เครื่องมือเปรียบเทียบไฟล์ Excel ใช้ได้โดยไม่ต้องเข้าสู่ระบบ"
            aria-label="Excel Compare (เครื่องมือเปรียบเทียบไฟล์ Excel)"
          >
            <svg viewBox="0 0 20 20" class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M4 7h11M12 4l3 3-3 3M16 13H5M8 10l-3 3 3 3" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span class="hidden xl:inline">Excel Compare</span>
          </a>
          @if (auth.user(); as user) {
            <div class="flex items-center gap-2">
              <div class="relative" #userMenuRoot>
                <button
                  type="button"
                  class="h-9 inline-flex items-center gap-2 pl-1 pr-2 rounded-xl border border-slate-200 hover:bg-slate-50 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                  aria-haspopup="menu"
                  [attr.aria-expanded]="userMenuOpen()"
                  [attr.aria-label]="'บัญชีผู้ใช้ ' + user.displayName"
                  [title]="user.displayName"
                  (click)="userMenuOpen.set(!userMenuOpen())"
                >
                  <span class="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold uppercase">
                    {{ user.username.slice(0, 2) }}
                  </span>
                  <span class="hidden 2xl:inline max-w-40 truncate text-sm font-semibold text-slate-700">{{ user.displayName }}</span>
                  <span class="hidden sm:inline rounded-md px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap" [class]="roleBadge[user.role]">{{ roleLabels[user.role] }}</span>
                  <svg viewBox="0 0 20 20" class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M6 8l4 4 4-4" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
                @if (userMenuOpen()) {
                  <div role="menu" class="absolute right-0 mt-2 w-60 bg-white border border-slate-200 rounded-xl shadow-xl p-1 z-30">
                    <div class="px-3 py-2.5 mb-1 border-b border-slate-100">
                      <div class="text-sm font-semibold text-slate-900 truncate">{{ user.displayName }}</div>
                      <div class="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                        <span class="truncate">{{ user.username }}</span>
                        <span class="rounded-md px-1.5 py-0.5 text-[11px] font-bold" [class]="roleBadge[user.role]">{{ roleLabels[user.role] }}</span>
                      </div>
                    </div>
                    <a
                      routerLink="/change-password"
                      role="menuitem"
                      class="w-full flex items-center gap-2.5 text-left px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                      (click)="userMenuOpen.set(false)"
                    >
                      <svg viewBox="0 0 20 20" class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                        <rect x="4.5" y="9" width="11" height="8" rx="2" />
                        <path d="M7 9V6.5a3 3 0 016 0V9" stroke-linecap="round" />
                      </svg>
                      เปลี่ยนรหัสผ่าน
                    </a>
                    <button
                      type="button"
                      role="menuitem"
                      class="w-full flex items-center gap-2.5 text-left px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50"
                      (click)="logout()"
                    >
                      <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                        <path d="M12 4h2.5A1.5 1.5 0 0116 5.5v9a1.5 1.5 0 01-1.5 1.5H12M8 6.5L4.5 10 8 13.5M4.5 10H12" stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                      ออกจากระบบ
                    </button>
                  </div>
                }
              </div>
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
  /** Show the Excel export and add buttons; off for read-only pages such as the dashboard. */
  showActions = input(true);
  /** Show the fiscal-year selector; off for pages that are about a single project. */
  showYear = input(true);
  /** Show Admin's "whose data" selector; on for the pages that list projects or events. */
  showOwnerFilter = input(false);

  /** The "whose data" selector is Admin's only. */
  readonly ownerFilterVisible = computed(() => this.showOwnerFilter() && this.auth.hasRole('ADMIN'));

  yearChange = output<number>();
  addClick = output<void>();
  exportExcel = output<void>();

  userMenuOpen = signal(false);

  readonly auth = inject(AuthService);
  readonly scope = inject(DataScopeService);
  readonly excel = inject(ExcelExportService);
  private readonly users = inject(UserStore);
  private readonly router = inject(Router);
  readonly currentYear = currentFiscalYear();
  readonly roleLabels = ROLE_LABELS;
  readonly roleBadge = ROLE_BADGE_CLASS;

  /** The pages of the signed-in account's role; none when signed out, so the menu is hidden. */
  readonly navItems = computed(() => {
    const user = this.auth.user();
    return NAV_ITEMS.filter((item) => {
      if (item.area === 'projects') return canUseProjects(user);
      if (item.area === 'events') return canUseEvents(user);
      return canManageUsers(user);
    });
  });

  /** The accounts that can own projects, for Admin's "whose data" selector. */
  readonly filterUsers = computed(() =>
    this.users
      .users()
      .filter((u) => u.role !== 'SUPER_ADMIN')
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'th')),
  );

  /** The years to choose from, newest first; always includes the selected one. */
  yearOptions = computed(() => Array.from(new Set([...this.years(), this.selectedYear()])).sort((a, b) => b - a));

  isPast = computed(() => this.selectedYear() < this.currentYear);
  hasOlder = computed(() => this.selectedYear() > Math.min(...this.yearOptions()));
  hasNewer = computed(() => this.selectedYear() < Math.max(...this.yearOptions()));

  logout(): void {
    this.userMenuOpen.set(false);
    this.auth.logout();
    this.scope.setOwnerFilter('all');
    this.router.navigateByUrl('/excel');
  }

  private readonly userMenuRoot = viewChild<ElementRef<HTMLElement>>('userMenuRoot');

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const userRoot = this.userMenuRoot()?.nativeElement;
    if (userRoot && !userRoot.contains(event.target as Node)) {
      this.userMenuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.userMenuOpen.set(false);
  }
}
