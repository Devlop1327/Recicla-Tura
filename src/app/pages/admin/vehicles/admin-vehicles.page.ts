import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { VehiclesPage } from '../../vehicles/vehicles.page';

@Component({
  selector: 'app-admin-vehicles',
  standalone: true,
  imports: [IonicModule, CommonModule, RouterModule, VehiclesPage],
  templateUrl: './admin-vehicles.page.html'
})
export class AdminVehiclesPage {}
