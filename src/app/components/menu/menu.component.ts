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

// Servicio de autenticación temporal
class AuthService {
  async logout() {
    console.log('Cerrando sesión...');
    localStorage.removeItem('token');
  }
}

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
        <ion-item button (click)="navigateTo('home')">
          <ion-icon slot="start" name="home-outline"></ion-icon>
          <ion-label>Inicio</ion-label>
        </ion-item>

        <ion-item button (click)="navigateTo('vehicles')">
          <ion-icon slot="start" name="car-outline"></ion-icon>
          <ion-label>Vehículos</ion-label>
        </ion-item>

        <ion-item button (click)="navigateTo('notifications')">
          <ion-icon slot="start" name="notifications-outline"></ion-icon>
          <ion-label>Notificaciones</ion-label>
          <ion-badge *ngIf="unreadNotifications > 0" slot="end" color="danger">
            {{ unreadNotifications }}
          </ion-badge>
        </ion-item>

        <ion-item button (click)="navigateTo('profile')">
          <ion-icon slot="start" name="person-outline"></ion-icon>
          <ion-label>Perfil</ion-label>
        </ion-item>

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
  private authService = new AuthService();
  
  unreadNotifications = 0;

  async navigateTo(route: string) {
    await this.menuCtrl.close();
    this.router.navigate(['/tabs', route]);
  }

  async closeMenu() {
    await this.menuCtrl.close();
  }

  async logout() {
    try {
      await this.menuCtrl.close();
      await this.authService.logout();
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  }
}
