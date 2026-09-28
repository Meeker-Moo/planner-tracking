import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Pages behind the login: without a session, go to the login page and come back here afterwards. */
export const authGuard: CanActivateFn = (_route, state) =>
  inject(AuthService).isLoggedIn() || inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });

/** The login page itself: someone already signed in has nothing to do there. */
export const guestGuard: CanActivateFn = () => !inject(AuthService).isLoggedIn() || inject(Router).createUrlTree(['/dashboard']);
