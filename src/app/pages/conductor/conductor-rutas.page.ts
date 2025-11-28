import { Component, signal, computed } from '@angular/core';
import { IonicModule, AlertController, MenuController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { RecorridosService } from '../../services/recorridos.service';
import { ApiService, Vehiculo } from '../../services/api.service';

@Component({
  selector: 'app-conductor-rutas',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './conductor-rutas.page.html',
  styleUrls: ['./conductor-rutas.page.scss']
})
export class ConductorRutasPage {
  rutas = signal<Array<{ id: string; nombre: string }>>([]);
  isLoading = signal(false);
  vehiculos = signal<Vehiculo[]>([]);
  activo = computed(() => this.recorridos.hasActiveRecorrido());

  constructor(
    private recorridos: RecorridosService,
    private router: Router,
    private api: ApiService,
    private alertCtrl: AlertController,
    private menuCtrl: MenuController
  ) {}

  async ionViewWillEnter() {
    this.isLoading.set(true);
    try {
      const [rs, vs] = await Promise.all([
        this.recorridos.getAssignedRutas(),
        this.api.getVehiculos().catch(() => [])
      ]);
      this.rutas.set(rs);
      this.vehiculos.set(Array.isArray(vs) ? vs : []);
    } finally {
      this.isLoading.set(false);
    }
  }

  async go(path: string) {
    try {
      await this.router.navigateByUrl(path);
    } finally {
      try { await this.menuCtrl.close('conductorMenu'); } catch {}
    }
  }

  async seleccionar(rutaId: string) {
    const vehs = this.vehiculos();
    let selected: string | null = vehs[0]?.id || null;
    const ruta = this.rutas().find(r => r.id === rutaId) || null;
    // Guardar metadata para la siguiente vista
    this.recorridos.setCurrentRouteMeta(rutaId, ruta?.nombre ?? null);
    if (vehs.length > 0) {
      const alert = await this.alertCtrl.create({
        header: 'Selecciona tu vehículo',
        inputs: vehs.map(v => ({
          name: 'veh',
          type: 'radio',
          label: `${v.placa}${v.modelo ? ' · ' + v.modelo : ''}`,
          value: v.id,
          checked: v.id === selected
        })),
        buttons: [
          { text: 'Cancelar', role: 'cancel' },
          { text: 'Aceptar', role: 'confirm' }
        ]
      });
      await alert.present();
      const res = await alert.onDidDismiss();
      if (res.role !== 'confirm') return;
      selected = (res.data as any)?.values ?? (res.data as any)?.value ?? selected;
    }
    await this.router.navigate(['/mapa'], {
      queryParams: {
        ruta: rutaId,
        vehiculo: selected || undefined
      }
    });
  }

  async onRefresh(ev: CustomEvent) {
    try {
      await this.ionViewWillEnter();
    } finally {
      const target = ev?.target as HTMLIonRefresherElement | undefined;
      target?.complete?.();
    }
  }

  continuarRecorrido() {
    if (this.activo()) {
      this.router.navigateByUrl('/conductor/recorrido');
    }
  }

  async finalizarActual() {
    if (!this.activo()) return;
    await this.recorridos.stopRecorrido();
  }
}
