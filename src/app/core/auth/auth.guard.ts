import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { canUseProjects } from './permissions';
import { Role } from './user.model';

/**
 * Pages behind the login: without a session, go to the login page and come back here afterwards.
 * An account that still has a one-time password must change it first.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const user = inject(AuthService).user();
  const router = inject(Router);
  if (!user) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  if (user.mustChangePassword) return router.createUrlTree(['/change-password'], { queryParams: { returnUrl: state.url } });
  return true;
};

/** The change-password page: any signed-in account, including one that must change its password. */
export const signedInGuard: CanActivateFn = (_route, state) =>
  inject(AuthService).isLoggedIn() || inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });

/** The login page itself: someone already signed in has nothing to do there. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return !auth.isLoggedIn() || inject(Router).createUrlTree([auth.homeUrl()]);
};

/** Pages for the given roles only; anyone else goes to their own start page. */
export const roleGuard =
  (...roles: Role[]): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    return auth.hasRole(...roles) || inject(Router).createUrlTree([auth.homeUrl()]);
  };

/** Projects, Timeline, Monthly Report and the Dashboard, which Super Admin does not use. */
export const projectsGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return canUseProjects(auth.user()) || inject(Router).createUrlTree([auth.homeUrl()]);
};
