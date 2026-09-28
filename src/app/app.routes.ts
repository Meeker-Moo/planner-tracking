import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';

// Excel Compare is open to everyone and is the first page; everything else needs a login.
export const routes: Routes = [
  { path: '', redirectTo: 'excel', pathMatch: 'full' },
  { path: 'excel', loadComponent: () => import('./features/excel-compare/excel-compare').then((m) => m.ExcelCompare) },
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./features/login/login').then((m) => m.Login) },
  {
    path: '',
    canActivateChild: [authGuard],
    children: [
      { path: 'plans', loadComponent: () => import('./features/plan-list/plan-list').then((m) => m.PlanList) },
      { path: 'plans/:id', loadComponent: () => import('./features/project-detail/project-detail').then((m) => m.ProjectDetail) },
      { path: 'timeline', loadComponent: () => import('./features/timeline/timeline').then((m) => m.Timeline) },
      { path: 'monthly-report', loadComponent: () => import('./features/monthly-report/monthly-report').then((m) => m.MonthlyReport) },
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard) },
    ],
  },
  { path: '**', redirectTo: 'excel' },
];
