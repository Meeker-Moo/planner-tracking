import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { SessionData } from './core/services/session-data.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Before the first page: who is signed in (from the session cookie), and that account's data, so the guards
    // and a reloaded /plans/<id> see it. Later sign-ins load it on their own (SessionLoader).
    provideAppInitializer(async () => {
      const auth = inject(AuthService);
      const data = inject(SessionData);
      await auth.restore();
      await data.ready();
    }),
  ],
};
