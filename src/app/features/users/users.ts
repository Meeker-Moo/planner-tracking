import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Toolbar } from '../../shared/components/toolbar/toolbar';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { UserFormDialog } from './user-form-dialog';
import { AuthService } from '../../core/auth/auth.service';
import { assignableRoles, canManageUser } from '../../core/auth/permissions';
import { NewUserInput, UserStore } from '../../core/auth/user-store.service';
import { AppUser, ROLE_BADGE_CLASS, ROLE_LABELS, Role, authErrorMessage } from '../../core/auth/user.model';
import { formatDateShort } from '../../shared/utils/date.util';

type PendingAction = { kind: 'deactivate' | 'activate' | 'reset'; user: AppUser };

const ROLE_ORDER: Record<Role, number> = { SUPER_ADMIN: 0, ADMIN: 1, USER: 2 };

/**
 * Accounts: add, rename, change role, deactivate / reactivate and reset the password. Super Admin manages
 * every other account; Admin only User accounts (the rest are listed but read-only). Nothing is deleted.
 */
@Component({
  selector: 'app-users',
  standalone: true,
  imports: [Toolbar, ConfirmDialog, UserFormDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grow flex flex-col min-h-0' },
  template: `
    <app-toolbar [showActions]="false" [showYear]="false" />

    <div class="grow overflow-auto">
      <div class="max-w-6xl mx-auto px-4 md:px-8 py-5 md:py-7 flex flex-col gap-5">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 class="text-xl md:text-2xl font-bold text-slate-900">จัดการผู้ใช้</h1>
            <p class="mt-0.5 text-sm text-slate-500">
              ใช้งานอยู่ {{ activeCount() }} บัญชี · ปิดใช้งาน {{ users().length - activeCount() }} บัญชี
              @if (isAdminOnly()) {
                · Admin จัดการได้เฉพาะบัญชี User
              }
            </p>
          </div>
          <button
            type="button"
            class="h-10 inline-flex items-center gap-1.5 px-4 rounded-xl bg-blue-600 text-white text-sm font-bold shadow-sm shadow-blue-600/30 hover:bg-blue-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
            (click)="openAdd()"
          >
            <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
              <path d="M10 4.5v11M4.5 10h11" stroke-linecap="round" />
            </svg>
            เพิ่มผู้ใช้
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-2.5">
          <label class="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2 bg-white w-full sm:w-72 shadow-sm focus-within:ring-2 focus-within:ring-blue-500/40 focus-within:border-blue-400">
            <svg viewBox="0 0 20 20" class="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <circle cx="9" cy="9" r="5.5" /><path d="M13 13l3.5 3.5" stroke-linecap="round" />
            </svg>
            <input
              type="text"
              placeholder="ค้นหาชื่อหรือชื่อผู้ใช้"
              aria-label="ค้นหาผู้ใช้"
              class="grow min-w-0 text-sm outline-none bg-transparent"
              [value]="keyword()"
              (input)="keyword.set($any($event.target).value)"
            />
          </label>
          <label class="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" class="w-4 h-4 accent-blue-600" [checked]="showInactive()" (change)="showInactive.set($any($event.target).checked)" />
            แสดงบัญชีที่ปิดใช้งาน
          </label>
        </div>

        <!-- Wide screens: table -->
        <div class="hidden md:block bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-slate-50 border-b border-slate-200 text-left">
                <th class="px-4 py-3 text-xs font-bold text-slate-500 tracking-wide">ผู้ใช้</th>
                <th class="px-4 py-3 text-xs font-bold text-slate-500 tracking-wide">บทบาท</th>
                <th class="px-4 py-3 text-xs font-bold text-slate-500 tracking-wide">สถานะ</th>
                <th class="px-4 py-3 text-xs font-bold text-slate-500 tracking-wide">สร้างโดย</th>
                <th class="px-4 py-3"><span class="sr-only">จัดการ</span></th>
              </tr>
            </thead>
            <tbody>
              @for (u of visibleUsers(); track u.id) {
                <tr class="border-b border-slate-100 last:border-0" [class.bg-slate-50]="!u.active">
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-3">
                      <span
                        class="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold uppercase"
                        [class]="u.active ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'"
                      >
                        {{ u.username.slice(0, 2) }}
                      </span>
                      <div class="min-w-0">
                        <div class="font-semibold text-slate-900 truncate" [class.text-slate-500]="!u.active">
                          {{ u.displayName }}
                          @if (u.id === me()?.id) {
                            <span class="ml-1 text-xs font-medium text-blue-600">(คุณ)</span>
                          }
                        </div>
                        <div class="text-xs text-slate-500">{{ u.username }}</div>
                      </div>
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <span class="rounded-md px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap" [class]="roleBadge[u.role]">{{ roleLabels[u.role] }}</span>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex flex-wrap gap-1.5">
                      @if (u.active) {
                        <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700">ใช้งานอยู่</span>
                      } @else {
                        <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-slate-200 text-slate-600">ปิดใช้งาน</span>
                      }
                      @if (u.mustChangePassword) {
                        <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-700" title="ยังใช้รหัสผ่านชั่วคราวอยู่">รอเปลี่ยนรหัสผ่าน</span>
                      }
                    </div>
                  </td>
                  <td class="px-4 py-3 text-slate-600 whitespace-nowrap">
                    <div>{{ u.createdBy ? store.displayName(u.createdBy) : 'ระบบ' }}</div>
                    <div class="text-xs text-slate-400">{{ formatDate(u.createdAt.slice(0, 10)) }}</div>
                  </td>
                  <td class="px-4 py-3 text-right whitespace-nowrap">
                    @if (canManage(u)) {
                      <div class="inline-flex items-center gap-1">
                        <button type="button" class="px-2.5 py-1.5 rounded-lg text-sm font-semibold text-blue-600 hover:bg-blue-50" (click)="openEdit(u)">แก้ไข</button>
                        <button type="button" class="px-2.5 py-1.5 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100" (click)="pending.set({ kind: 'reset', user: u })">
                          รีเซ็ตรหัสผ่าน
                        </button>
                        @if (u.active) {
                          <button type="button" class="px-2.5 py-1.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50" (click)="pending.set({ kind: 'deactivate', user: u })">
                            ปิดใช้งาน
                          </button>
                        } @else {
                          <button type="button" class="px-2.5 py-1.5 rounded-lg text-sm font-semibold text-emerald-700 hover:bg-emerald-50" (click)="pending.set({ kind: 'activate', user: u })">
                            เปิดใช้งาน
                          </button>
                        }
                      </div>
                    } @else {
                      <span class="text-xs text-slate-400">{{ u.id === me()?.id ? 'เปลี่ยนรหัสผ่านได้จากเมนูบัญชี' : 'ไม่มีสิทธิ์จัดการ' }}</span>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="5" class="px-4 py-10 text-center text-sm text-slate-400">ไม่พบผู้ใช้</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Phones: cards -->
        <div class="md:hidden flex flex-col gap-3">
          @for (u of visibleUsers(); track u.id) {
            <article class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 flex flex-col gap-3" [class.bg-slate-50]="!u.active">
              <div class="flex items-start gap-3">
                <span
                  class="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold uppercase"
                  [class]="u.active ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'"
                >
                  {{ u.username.slice(0, 2) }}
                </span>
                <div class="min-w-0 grow">
                  <div class="font-semibold text-slate-900">
                    {{ u.displayName }}
                    @if (u.id === me()?.id) {
                      <span class="ml-1 text-xs font-medium text-blue-600">(คุณ)</span>
                    }
                  </div>
                  <div class="text-xs text-slate-500">{{ u.username }}</div>
                </div>
                <span class="rounded-md px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap" [class]="roleBadge[u.role]">{{ roleLabels[u.role] }}</span>
              </div>
              <div class="flex flex-wrap gap-1.5">
                @if (u.active) {
                  <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700">ใช้งานอยู่</span>
                } @else {
                  <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-slate-200 text-slate-600">ปิดใช้งาน</span>
                }
                @if (u.mustChangePassword) {
                  <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-700">รอเปลี่ยนรหัสผ่าน</span>
                }
              </div>
              @if (canManage(u)) {
                <div class="flex flex-wrap items-center justify-end gap-1 border-t border-slate-100 pt-2.5 -mb-1">
                  <button type="button" class="px-3 py-1.5 rounded-lg text-sm font-semibold text-blue-600 hover:bg-blue-50" (click)="openEdit(u)">แก้ไข</button>
                  <button type="button" class="px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100" (click)="pending.set({ kind: 'reset', user: u })">รีเซ็ตรหัสผ่าน</button>
                  @if (u.active) {
                    <button type="button" class="px-3 py-1.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50" (click)="pending.set({ kind: 'deactivate', user: u })">ปิดใช้งาน</button>
                  } @else {
                    <button type="button" class="px-3 py-1.5 rounded-lg text-sm font-semibold text-emerald-700 hover:bg-emerald-50" (click)="pending.set({ kind: 'activate', user: u })">เปิดใช้งาน</button>
                  }
                </div>
              }
            </article>
          } @empty {
            <p class="py-10 text-center text-sm text-slate-400">ไม่พบผู้ใช้</p>
          }
        </div>
      </div>
    </div>

    <app-user-form-dialog
      [open]="formOpen()"
      [editing]="editing()"
      [roles]="roles()"
      [busy]="busy()"
      [error]="formError()"
      (save)="onSave($event)"
      (cancel)="closeForm()"
    />

    <app-confirm-dialog
      [open]="pending() !== null"
      [title]="pendingTitle()"
      [message]="pendingMessage()"
      [confirmText]="pendingTitle()"
      (confirm)="runPending()"
      (cancel)="pending.set(null)"
    />

    @if (issued(); as i) {
      <div class="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
        <div role="dialog" aria-modal="true" class="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div class="p-6 flex flex-col gap-3">
            <h2 class="text-lg font-bold text-slate-900">{{ i.created ? 'สร้างผู้ใช้แล้ว' : 'รีเซ็ตรหัสผ่านแล้ว' }}</h2>
            <p class="text-sm text-slate-600">
              แจ้งรหัสผ่านชั่วคราวนี้ให้ <b>{{ i.user.displayName }}</b> ({{ i.user.username }}) ระบบจะแสดงรหัสนี้เพียงครั้งเดียว
              และผู้ใช้ต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบ
            </p>
            <div class="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5">
              <code class="grow font-mono text-base font-bold tracking-wider text-slate-900 select-all">{{ i.password }}</code>
              <button type="button" class="px-2.5 py-1 rounded-lg bg-white text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50" (click)="copy(i.password)">
                {{ copied() ? 'คัดลอกแล้ว' : 'คัดลอก' }}
              </button>
            </div>
          </div>
          <div class="px-6 pb-6 flex justify-end">
            <button type="button" class="px-4 py-2 rounded-lg bg-blue-600 text-sm font-bold text-white" (click)="issued.set(null)">เสร็จสิ้น</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class Users {
  readonly store = inject(UserStore);
  private readonly auth = inject(AuthService);

  readonly roleLabels = ROLE_LABELS;
  readonly roleBadge = ROLE_BADGE_CLASS;
  readonly formatDate = formatDateShort;

  keyword = signal('');
  showInactive = signal(true);
  formOpen = signal(false);
  editing = signal<AppUser | null>(null);
  busy = signal(false);
  formError = signal('');
  pending = signal<PendingAction | null>(null);
  issued = signal<{ user: AppUser; password: string; created: boolean } | null>(null);
  copied = signal(false);

  readonly me = this.auth.user;
  readonly users = this.store.users;
  readonly roles = computed(() => assignableRoles(this.me()));
  readonly isAdminOnly = computed(() => this.me()?.role === 'ADMIN');
  readonly activeCount = computed(() => this.users().filter((u) => u.active).length);

  /** Active first, then by role (Super Admin first) and name. */
  readonly visibleUsers = computed(() => {
    const keyword = this.keyword().trim().toLowerCase();
    return this.users()
      .filter((u) => this.showInactive() || u.active)
      .filter((u) => !keyword || u.username.includes(keyword) || u.displayName.toLowerCase().includes(keyword))
      .sort(
        (a, b) =>
          Number(b.active) - Number(a.active) ||
          ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
          a.displayName.localeCompare(b.displayName, 'th'),
      );
  });

  readonly pendingTitle = computed(() => {
    switch (this.pending()?.kind) {
      case 'deactivate':
        return 'ปิดใช้งาน';
      case 'activate':
        return 'เปิดใช้งาน';
      default:
        return 'รีเซ็ตรหัสผ่าน';
    }
  });

  readonly pendingMessage = computed(() => {
    const p = this.pending();
    if (!p) return '';
    const who = `"${p.user.displayName}" (${p.user.username})`;
    switch (p.kind) {
      case 'deactivate':
        return `ปิดใช้งานบัญชี ${who}? ผู้ใช้จะถูกออกจากระบบทันทีและเข้าสู่ระบบไม่ได้ ส่วนโครงการและ Event ของบัญชีนี้ยังอยู่ครบ`;
      case 'activate':
        return `เปิดใช้งานบัญชี ${who} อีกครั้ง?`;
      case 'reset':
        return `รีเซ็ตรหัสผ่านของ ${who}? ระบบจะสร้างรหัสผ่านชั่วคราวใหม่ และผู้ใช้จะถูกออกจากระบบทันที`;
    }
  });

  canManage(user: AppUser): boolean {
    return canManageUser(this.me(), user);
  }

  openAdd(): void {
    this.editing.set(null);
    this.formError.set('');
    this.formOpen.set(true);
  }

  openEdit(user: AppUser): void {
    this.editing.set(user);
    this.formError.set('');
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.editing.set(null);
  }

  async onSave(input: NewUserInput): Promise<void> {
    const actor = this.me();
    if (!actor || this.busy()) return;
    this.busy.set(true);
    this.formError.set('');
    try {
      const editing = this.editing();
      if (editing) {
        await this.store.update(actor, editing.id, { displayName: input.displayName, role: input.role });
        this.closeForm();
      } else {
        const { user, tempPassword } = await this.store.create(actor, input);
        this.closeForm();
        this.showPassword(user, tempPassword, true);
      }
    } catch (err) {
      this.formError.set(authErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  async runPending(): Promise<void> {
    const p = this.pending();
    const actor = this.me();
    this.pending.set(null);
    if (!p || !actor) return;
    try {
      if (p.kind === 'reset') {
        this.showPassword(p.user, await this.store.resetPassword(actor, p.user.id), false);
      } else {
        await this.store.update(actor, p.user.id, { active: p.kind === 'activate' });
      }
    } catch (err) {
      alert(authErrorMessage(err));
    }
  }

  async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
    } catch {
      // Clipboard blocked: the password is selectable on screen.
    }
  }

  private showPassword(user: AppUser, password: string, created: boolean): void {
    this.copied.set(false);
    this.issued.set({ user, password, created });
  }
}
