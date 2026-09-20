import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'plans', loadComponent: () => import('./features/plan-list/plan-list').then((m) => m.PlanList) },
  { path: 'plans/:id', loadComponent: () => import('./features/project-detail/project-detail').then((m) => m.ProjectDetail) },
  { path: 'timeline', loadComponent: () => import('./features/timeline/timeline').then((m) => m.Timeline) },
  { path: 'monthly-report', loadComponent: () => import('./features/monthly-report/monthly-report').then((m) => m.MonthlyReport) },
  { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard) },
  { path: '**', redirectTo: 'dashboard' },
];
