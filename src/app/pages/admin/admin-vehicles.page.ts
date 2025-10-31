import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { VehiclesPage } from '../vehicles/vehicles.page';

@Component({
  selector: 'app-admin-vehicles',
  standalone: true,
  imports: [IonicModule, CommonModule, VehiclesPage],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button autoHide="false"></ion-menu-button>
        </ion-buttons>
        <ion-title>Vehículos</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <app-vehicles></app-vehicles>
    </ion-content>
  `,
})
export class AdminVehiclesPage {}
