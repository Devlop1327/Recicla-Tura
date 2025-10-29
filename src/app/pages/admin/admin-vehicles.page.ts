import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-admin-vehicles',
  standalone: true,
  imports: [IonicModule, CommonModule],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Vehículos</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list inset>
        <ion-item lines="none">
          <ion-label>
            <h2>Gestión de vehículos</h2>
          </ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  `,
})
export class AdminVehiclesPage {}
