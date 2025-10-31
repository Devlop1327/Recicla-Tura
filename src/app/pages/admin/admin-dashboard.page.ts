import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [IonicModule, CommonModule],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button autoHide="false" menu="admin-menu"></ion-menu-button>
        </ion-buttons>
        <ion-title>Dashboard</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list inset>
        <ion-item lines="none">
          <ion-label>
            <h2>Panel de administración</h2>
            <p>Resumen y accesos rápidos.</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <ion-grid>
        <ion-row>
          <ion-col size="12" size-md="6">
            <ion-card button (click)="go('/admin/routes')">
              <ion-card-header>
                <ion-card-title>Rutas</ion-card-title>
              </ion-card-header>
              <ion-card-content>Gestiona rutas: crear, editar, eliminar.</ion-card-content>
            </ion-card>
          </ion-col>
          <ion-col size="12" size-md="6">
            <ion-card button (click)="go('/admin/users')">
              <ion-card-header>
                <ion-card-title>Usuarios</ion-card-title>
              </ion-card-header>
              <ion-card-content>Gestiona perfiles y roles.</ion-card-content>
            </ion-card>
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="12" size-md="6">
            <ion-card button (click)="go('/admin/vehicles')">
              <ion-card-header>
                <ion-card-title>Vehículos</ion-card-title>
              </ion-card-header>
              <ion-card-content>Asigna y administra vehículos.</ion-card-content>
            </ion-card>
          </ion-col>
          <ion-col size="12" size-md="6">
            <ion-card button (click)="go('/mapa')">
              <ion-card-header>
                <ion-card-title>Mapa</ion-card-title>
              </ion-card-header>
              <ion-card-content>Visualiza rutas y recorridos.</ion-card-content>
            </ion-card>
          </ion-col>
        </ion-row>
      </ion-grid>
    </ion-content>
  `,
})
export class AdminDashboardPage {
  constructor(private router: Router) {}
  async go(path: string) { await this.router.navigateByUrl(path); }
}

