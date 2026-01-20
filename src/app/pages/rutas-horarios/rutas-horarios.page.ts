import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { ApiService, Ruta } from '../../services/api.service';

@Component({
  selector: 'app-rutas-horarios',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './rutas-horarios.page.html',
  styleUrls: ['./rutas-horarios.page.scss'],
})
export class RutasHorariosPage implements OnInit {
  rutas = signal<Ruta[]>([]);
  isLoading = signal<boolean>(false);
  selectedRuta = signal<Ruta | null>(null);

  constructor(private api: ApiService, private router: Router) {}

  async ngOnInit() {
    await this.loadRutas();
  }

  async loadRutas() {
    this.isLoading.set(true);
    try {
      const rs = await this.api.getRutas().catch(() => [] as Ruta[]);
      this.rutas.set(rs || []);
      if ((rs || []).length > 0) {
        this.selectedRuta.set((rs || [])[0]);
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  selectRuta(ruta: Ruta) {
    this.selectedRuta.set(ruta);
  }
}
