import { Component, computed } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { RecorridosService } from '../../services/recorridos.service';

@Component({
  selector: 'app-conductor-recorrido',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './conductor-recorrido.page.html',
  styleUrls: ['./conductor-recorrido.page.scss']
})
export class ConductorRecorridoPage {
  activo = computed(() => this.recorridos.hasActiveRecorrido());

  constructor(private recorridos: RecorridosService, private router: Router) {}

  async finalizar() {
    await this.recorridos.stopRecorrido();
    await this.router.navigateByUrl('/conductor/rutas');
  }
}
