import { Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';
import { roleMatchGuard } from './guards/role-match.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/start/start.page').then(m => m.StartPage)
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then(m => m.LoginPage)
  },
  {
    path: 'recover',
    loadComponent: () => import('./pages/recover/recover.page').then(m => m.RecoverPage)
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./pages/reset-password/reset-password.page').then(m => m.ResetPasswordPage)
  },
  {
    path: 'tabs',
    loadComponent: () => import('./tabs/tabs.page').then(m => m.TabsPage),
    canActivate: [AuthGuard],
    children: [
      {
        path: 'home',
        loadComponent: () => import('./pages/home/home.page').then(m => m.HomePage)
      },
      {
        path: 'profile',
        loadComponent: () => import('./pages/profile/profile.page').then(m => m.ProfilePage)
      },
      {
        path: 'notifications',
        loadComponent: () => import('./pages/notifications/notifications.page').then(m => m.NotificationsPage)
      },
      {
        path: 'vehicles',
        loadComponent: () => import('./pages/vehicles/vehicles.page').then(m => m.VehiclesPage),
        canActivate: [roleGuard],
        data: { roles: ['admin'] }
      },
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full'
      }
    ]
  },
  {
    path: 'conductor',
    loadChildren: () => import('./conductor/conductor.routes').then(m => m.CONDUCTOR_ROUTES),
    canMatch: [roleMatchGuard],
    data: { roles: ['conductor', 'admin'] }
  },
  {
    path: 'admin',
    loadComponent: () => import('./pages/admin/admin.page').then(m => m.AdminPage),
    canMatch: [roleMatchGuard],
    data: { roles: ['admin'] },
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./pages/admin/admin-dashboard.page').then(m => m.AdminDashboardPage)
      },
      {
        path: 'users',
        loadComponent: () => import('./pages/admin/admin-users.page').then(m => m.AdminUsersPage)
      },
      {
        path: 'routes',
        loadComponent: () => import('./pages/admin/admin-routes.page').then(m => m.AdminRoutesPage)
      },
      {
        path: 'vehicles',
        loadComponent: () => import('./pages/admin/admin-vehicles.page').then(m => m.AdminVehiclesPage)
      },
      {
        path: 'settings',
        loadComponent: () => import('./pages/admin/admin-settings.page').then(m => m.AdminSettingsPage)
      }
    ]
  },
  {
    path: 'mapa',
    loadComponent: () => import('./pages/mapa/mapa.page').then(m => m.MapaPage),
    canActivate: [roleGuard],
    data: { roles: ['admin','conductor','cliente'] }
  },
  {
    path: '**',
    redirectTo: '/login'
  }
];

