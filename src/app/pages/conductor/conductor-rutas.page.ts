import { Component, signal } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { RecorridosService } from '../../services/recorridos.service';

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

  constructor(private recorridos: RecorridosService, private router: Router) {}

  async ionViewWillEnter() {
    this.isLoading.set(true);
    try {
      const rs = await this.recorridos.getAssignedRutas();
      this.rutas.set(rs);
    } finally {
      this.isLoading.set(false);
    }
  }

  async seleccionar(rutaId: string) {
    await this.recorridos.startRecorrido(rutaId);
    await this.router.navigateByUrl('/conductor/recorrido');
  }

  async onRefresh(ev: CustomEvent) {
    try {
      await this.ionViewWillEnter();
    } finally {
      const target = ev?.target as HTMLIonRefresherElement | undefined;
      target?.complete?.();
    }
  }
}
