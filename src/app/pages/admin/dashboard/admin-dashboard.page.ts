import { Component, OnInit, signal } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService, Vehiculo } from '../../../services/api.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './admin-dashboard.page.html',
  styleUrls: ['./admin-dashboard.page.scss']
})
export class AdminDashboardPage implements OnInit {
  vehiculos = signal<Vehiculo[]>([]);
  isLoading = signal<boolean>(false);

  constructor(private router: Router, private api: ApiService) {}

  async ngOnInit() {
    await this.loadVehiculos();
  }

  async loadVehiculos() {
    this.isLoading.set(true);
    try {
      const list = await this.api.getVehiculos();
      const arr = Array.isArray(list) ? list : [];
      const sorted = [...arr].sort((a,b) => Number(!!b.activo) - Number(!!a.activo) || (a.placa || '').localeCompare(b.placa || ''));
      this.vehiculos.set(sorted);
    } catch {
      this.vehiculos.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  vehiculosPreview() {
    const list = this.vehiculos();
    return (list || []).slice(0, 5);
  }

  async go(path: string) { await this.router.navigateByUrl(path); }
}
