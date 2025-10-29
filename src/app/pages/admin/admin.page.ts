import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [IonicModule, CommonModule, RouterModule],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Administración</ion-title>
        <ion-badge slot="end" color="primary" style="margin-right:12px">Rol: {{ role() || '...' }}</ion-badge>
      </ion-toolbar>
    </ion-header>
    <ion-split-pane contentId="admin-content">
      <ion-menu contentId="admin-content" type="overlay">
        <ion-content>
          <ion-list>
            <ion-menu-toggle auto-hide="false">
              <ion-item button routerLink="/admin" routerDirection="root" lines="none">
                <ion-icon slot="start" name="home"></ion-icon>
                <ion-label>Dashboard</ion-label>
              </ion-item>
              <ion-item button routerLink="/admin/users" routerDirection="forward" lines="none">
                <ion-icon slot="start" name="people"></ion-icon>
                <ion-label>Usuarios</ion-label>
              </ion-item>
              <ion-item button routerLink="/admin/routes" routerDirection="forward" lines="none">
                <ion-icon slot="start" name="map"></ion-icon>
                <ion-label>Rutas</ion-label>
              </ion-item>
              <ion-item button routerLink="/admin/vehicles" routerDirection="forward" lines="none">
                <ion-icon slot="start" name="car"></ion-icon>
                <ion-label>Vehículos</ion-label>
              </ion-item>
            </ion-menu-toggle>
          </ion-list>
        </ion-content>
      </ion-menu>
      <ion-router-outlet id="admin-content"></ion-router-outlet>
    </ion-split-pane>
  `,
})
export class AdminPage {
  constructor(private supabase: SupabaseService) {}

  role(): 'admin' | 'conductor' | 'cliente' | null {
    return this.supabase.currentRole?.() ?? null;
  }
}
