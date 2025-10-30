import { Routes } from '@angular/router';

export const CONDUCTOR_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'rutas',
    pathMatch: 'full'
  },
  {
    path: 'rutas',
    loadComponent: () => import('../pages/conductor/conductor-rutas.page').then(m => m.ConductorRutasPage)
  },
  {
    path: 'recorrido',
    loadComponent: () => import('../pages/conductor/conductor-recorrido.page').then(m => m.ConductorRecorridoPage)
  }
];
