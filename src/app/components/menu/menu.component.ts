import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { 
  IonHeader, 
  IonToolbar, 
  IonTitle, 
  IonContent, 
  IonList, 
  IonItem, 
  IonLabel, 
  IonIcon, 
  IonButtons, 
  IonButton, 
  IonBadge,
  MenuController,
  IonMenu,
  IonMenuToggle
} from '@ionic/angular/standalone';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, 
    IonToolbar, 
    IonTitle, 
    IonContent, 
    IonList, 
    IonItem, 
    IonLabel, 
    IonIcon, 
    IonButtons, 
    IonButton,
    IonBadge
  ],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar color="primary">
        <ion-buttons slot="end">
          <ion-button (click)="closeMenu()">
            <ion-icon slot="icon-only" name="close-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>Menú</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list>
        @if (role() === 'admin') {
          <ion-item button (click)="navigateAbs('/admin/dashboard')">
            <ion-icon slot="start" name="home-outline"></ion-icon>
            <ion-label>Dashboard</ion-label>
          </ion-item>
          <ion-item button (click)="navigateAbs('/admin/users')">
            <ion-icon slot="start" name="people-outline"></ion-icon>
            <ion-label>Usuarios</ion-label>
          </ion-item>
          <ion-item button (click)="navigateAbs('/admin/routes')">
            <ion-icon slot="start" name="map-outline"></ion-icon>
            <ion-label>Rutas</ion-label>
          </ion-item>
          <ion-item button (click)="navigateAbs('/admin/vehicles')">
            <ion-icon slot="start" name="car-outline"></ion-icon>
            <ion-label>Vehículos</ion-label>
          </ion-item>
        } @else if (role() === 'conductor') {
          <ion-item button (click)="navigateAbs('/conductor/rutas')">
            <ion-icon slot="start" name="map-outline"></ion-icon>
            <ion-label>Rutas asignadas</ion-label>
          </ion-item>
          <ion-item button (click)="navigateAbs('/conductor/recorrido')">
            <ion-icon slot="start" name="navigate-outline"></ion-icon>
            <ion-label>Recorrido</ion-label>
          </ion-item>
          <ion-item button (click)="navigateAbs('/mapa')">
            <ion-icon slot="start" name="map"></ion-icon>
            <ion-label>Mapa</ion-label>
          </ion-item>
        } @else {
          <ion-item button (click)="navigateAbs('/tabs/home')">
            <ion-icon slot="start" name="home-outline"></ion-icon>
            <ion-label>Inicio</ion-label>
          </ion-item>
          <ion-item button (click)="navigateAbs('/tabs/notifications')">
            <ion-icon slot="start" name="notifications-outline"></ion-icon>
            <ion-label>Notificaciones</ion-label>
            @if (unreadNotifications > 0) {
              <ion-badge slot="end" color="danger">{{ unreadNotifications }}</ion-badge>
            }
          </ion-item>
          <ion-item button (click)="navigateAbs('/tabs/profile')">
            <ion-icon slot="start" name="person-outline"></ion-icon>
            <ion-label>Perfil</ion-label>
          </ion-item>
          <ion-item button (click)="navigateAbs('/mapa')">
            <ion-icon slot="start" name="map-outline"></ion-icon>
            <ion-label>Mapa</ion-label>
          </ion-item>
        }

        <ion-item button (click)="logout()">
          <ion-icon slot="start" name="log-out-outline"></ion-icon>
          <ion-label>Cerrar Sesión</ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  `
})
export class MenuComponent {
  private router = inject(Router);
  private menuCtrl = inject(MenuController);
  private supabaseService = inject(SupabaseService);
  
  unreadNotifications = 0;

  role(): 'admin' | 'conductor' | 'cliente' | null {
    return this.supabaseService.currentRole?.() ?? null;
  }

  async navigateAbs(path: string) {
    await this.menuCtrl.close();
    this.router.navigateByUrl(path);
  }

  async closeMenu() {
    await this.menuCtrl.close();
  }

  async logout() {
    try {
      await this.menuCtrl.close();
      await this.supabaseService.signOut();
      await this.router.navigate(['/login']);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  }
}
