import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'onboarding',
    loadComponent: () =>
      import('./pages/onboarding/onboarding.component').then(
        (m) => m.OnboardingComponent
      ),
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent
      ),
  },
  {
    path: 'session',
    loadComponent: () =>
      import('./pages/session/session.component').then(
        (m) => m.SessionComponent
      ),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./pages/settings/settings.component').then(
        (m) => m.SettingsComponent
      ),
  },
  {
    path: 'overlay',
    loadComponent: () =>
      import('./pages/overlay/overlay.component').then(
        (m) => m.OverlayComponent
      ),
  },
  {
    path: 'mobile/:token',
    loadComponent: () =>
      import('./pages/mobile-companion/mobile-companion.component').then(
        (m) => m.MobileCompanionComponent
      ),
  },
];
