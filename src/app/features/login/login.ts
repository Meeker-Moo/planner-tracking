import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, homeUrlFor, safeReturnUrl } from '../../core/auth/auth.service';
import { SEED_USERS } from '../../core/auth/auth.config';
import { ROLE_BADGE_CLASS, ROLE_LABELS, authErrorMessage } from '../../core/auth/user.model';

/**
 * Sign in, then go back to the page that asked for it (or the account's start page). An account with a
 * one-time password goes on to the change-password page first (authGuard sees to that).
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Fill the app shell's column so the background reaches the bottom of the window.
  host: { class: 'grow flex flex-col min-h-0' },
  template: `
    <div class="grow overflow-auto flex items-center justify-center p-4 bg-linear-to-br from-slate-100 via-blue-50 to-indigo-100">
      <div class="w-full max-w-sm flex flex-col gap-4">
        <div class="flex flex-col items-center gap-2 text-center">
          <div
            class="w-14 h-14 rounded-2xl bg-linear-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/30"
          >
            <svg viewBox="0 0 24 24" class="w-7 h-7" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
              <path d="M8.5 10.5V7.5a3.5 3.5 0 017 0v3" stroke-linecap="round" />
            </svg>
          </div>
          <h1 class="text-xl font-bold text-slate-900">เข้าสู่ระบบ</h1>
          <p class="text-sm text-slate-500">ระบบโครงการประจำปี · Annual Work Planning</p>
        </div>

        <form class="bg-white rounded-3xl shadow-xl ring-1 ring-slate-900/5 p-6 flex flex-col gap-4" (submit)="submit($event)">
          @if (fromPage()) {
            <p class="text-xs text-blue-800 bg-blue-50 ring-1 ring-blue-200 rounded-xl px-3 py-2">กรุณาเข้าสู่ระบบก่อนใช้งานหน้านี้</p>
          }

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-semibold text-slate-700">ชื่อผู้ใช้</span>
            <input
              type="text"
              name="username"
              autocomplete="username"
              autofocus
              class="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              [value]="username()"
              (input)="username.set($any($event.target).value); error.set('')"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-semibold text-slate-700">รหัสผ่าน</span>
            <div class="relative">
              <input
                name="password"
                autocomplete="current-password"
                class="w-full border border-slate-200 rounded-xl pl-3 pr-11 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                [type]="showPassword() ? 'text' : 'password'"
                [value]="password()"
                (input)="password.set($any($event.target).value); error.set('')"
              />
              <button
                type="button"
                class="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                [attr.aria-label]="showPassword() ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'"
                [attr.aria-pressed]="showPassword()"
                (click)="showPassword.set(!showPassword())"
              >
                <svg viewBox="0 0 20 20" class="w-4.5 h-4.5" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
                  <path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6S1.5 10 1.5 10z" stroke-linejoin="round" />
                  <circle cx="10" cy="10" r="2.5" />
                  @if (showPassword()) {
                    <path d="M3 17L17 3" stroke-linecap="round" />
                  }
                </svg>
              </button>
            </div>
          </label>

          <label class="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" class="w-4 h-4 accent-blue-600" [checked]="remember()" (change)="remember.set($any($event.target).checked)" />
            จดจำการเข้าสู่ระบบบนเครื่องนี้
          </label>

          @if (error()) {
            <p role="alert" class="text-sm text-red-700 bg-red-50 ring-1 ring-red-200 rounded-xl px-3 py-2">{{ error() }}</p>
          }

          <button
            type="submit"
            class="px-4 py-2.5 rounded-xl bg-blue-600 text-sm font-bold text-white shadow-sm shadow-blue-600/30 hover:bg-blue-700 disabled:opacity-50"
            [disabled]="busy() || !username().trim() || !password()"
          >
            {{ busy() ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ' }}
          </button>
        </form>

        @if (devAccounts.length) {
          <div class="bg-white/70 rounded-2xl ring-1 ring-slate-900/5 p-4 flex flex-col gap-2">
            <p class="text-xs font-semibold text-slate-500">บัญชีทดสอบ (develop) · คลิกเพื่อกรอก</p>
            <div class="flex flex-col gap-1">
              @for (a of devAccounts; track a.username) {
                <button
                  type="button"
                  class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-sm hover:bg-white"
                  (click)="fill(a.username, a.devPassword!)"
                >
                  <span class="rounded-md px-1.5 py-0.5 text-[11px] font-bold" [class]="roleBadge[a.role]">{{ roleLabels[a.role] }}</span>
                  <span class="font-semibold text-slate-800">{{ a.username }}</span>
                  <span class="text-slate-400">/ {{ a.devPassword }}</span>
                </button>
              }
            </div>
          </div>
        }

        <a routerLink="/excel" class="text-center text-sm font-semibold text-slate-500 hover:text-slate-800">← กลับไปหน้า Excel Compare</a>
      </div>
    </div>
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly returnUrl = inject(ActivatedRoute).snapshot.queryParamMap.get('returnUrl');

  username = signal('');
  password = signal('');
  remember = signal(false);
  showPassword = signal(false);
  busy = signal(false);
  error = signal('');

  /** The develop environment's test accounts (none in production). */
  readonly devAccounts = inject(SEED_USERS).filter((a) => a.devPassword);
  readonly roleLabels = ROLE_LABELS;
  readonly roleBadge = ROLE_BADGE_CLASS;

  fill(username: string, password: string): void {
    this.username.set(username);
    this.password.set(password);
    this.error.set('');
  }

  /** Whether the user was sent here by trying to open a locked page. */
  fromPage(): boolean {
    return !!this.returnUrl;
  }

  async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy() || !this.username().trim() || !this.password()) return;
    this.busy.set(true);
    try {
      const result = await this.auth.login(this.username(), this.password(), this.remember());
      if (result.ok) {
        await this.router.navigateByUrl(safeReturnUrl(this.returnUrl, homeUrlFor(result.user)));
      } else {
        this.error.set(authErrorMessage(result.error));
        this.password.set('');
      }
    } catch {
      this.error.set('เข้าสู่ระบบไม่ได้ในเบราว์เซอร์นี้ (ต้องเปิดผ่าน https หรือ localhost)');
    } finally {
      this.busy.set(false);
    }
  }
}
