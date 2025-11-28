import { Component, signal } from '@angular/core';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { MapDataService, RutaApiItem } from '../../../services/map-data.service';
import { RouterModule } from '@angular/router';
import { MessageService } from '@app/services/message.service';

@Component({
  selector: 'app-admin-routes',
  standalone: true,
  imports: [IonicModule, CommonModule, RouterModule],
  templateUrl: './admin-routes.page.html'
})

export class AdminRoutesPage {
  rutas = signal<RutaApiItem[]>([]);

  constructor(private mapData: MapDataService, private alertCtrl: AlertController, private toast: ToastController, private messages: MessageService) {}

  async ionViewWillEnter() { await this.load(); }

  private async load() {
    const list = await this.mapData.loadRutas();
    this.rutas.set(list);
  }

  async onRefresh(ev: CustomEvent) {
    try { await this.load(); } finally { (ev.target as HTMLIonRefresherElement)?.complete?.(); }
  }

  async confirmDelete(r: RutaApiItem) {
    const alert = await this.alertCtrl.create({
      header: 'Eliminar ruta',
      message: `¿Eliminar "${r.nombre || r.nombre_ruta}"?`,
      buttons: [ { text: 'Cancelar', role: 'cancel' }, { text: 'Eliminar', role: 'destructive' } ]
    });
    await alert.present();
    const res = await alert.onDidDismiss();
    if (res.role !== 'destructive') return;
    const ok = await this.mapData.deleteRuta(r.id as any);
    if (ok) {
      await this.messages.toastMsg('Ruta eliminada correctamente', 'success', 1200, 'top');
      await this.load();
    } else {
      await this.messages.toastMsg('No se pudo eliminar la ruta. Intenta nuevamente.', 'danger', 1500, 'top');
    }
  }

  async create() {
    const alert = await this.alertCtrl.create({
      header: 'Crear ruta',
      inputs: [
        { name: 'nombre', type: 'text', placeholder: 'Nombre', attributes: { maxlength: 120 } },
        { name: 'descripcion', type: 'text', placeholder: 'Descripción', attributes: { maxlength: 200 } }
      ],
      buttons: [ { text: 'Cancelar', role: 'cancel' }, { text: 'Crear', role: 'confirm' } ]
    });
    await alert.present();
    const res = await alert.onDidDismiss();
    if (res.role !== 'confirm') return;
    const values = (res.data as any)?.values || (res.data as any);
    const nombre = values?.nombre?.trim();
    const descripcion = values?.descripcion?.trim();
    if (!nombre) { const t = await this.toast.create({ message: 'Nombre requerido', duration: 1200, color: 'warning' }); t.present(); return; }
    const created = await this.mapData.createRuta({ nombre, descripcion, shape: undefined, callesIds: [] });
    if (created) {
      await this.messages.toastMsg('Ruta creada correctamente', 'success', 1200, 'top');
      await this.load();
    } else {
      await this.messages.toastMsg('No se pudo crear la ruta. Intenta nuevamente.', 'danger', 1500, 'top');
    }
  }

  async edit(r: RutaApiItem) {
    const alert = await this.alertCtrl.create({
      header: 'Editar ruta',
      inputs: [
        { name: 'nombre', type: 'text', placeholder: 'Nombre', value: r.nombre || r.nombre_ruta || '' },
        { name: 'descripcion', type: 'text', placeholder: 'Descripción', value: r.descripcion || r.descripcion_ruta || '' }
      ],
      buttons: [ { text: 'Cancelar', role: 'cancel' }, { text: 'Guardar', role: 'confirm' } ]
    });
    await alert.present();
    const res = await alert.onDidDismiss();
    if (res.role !== 'confirm') return;
    const values = (res.data as any)?.values || (res.data as any);
    const nombre = (values?.nombre ?? '').trim();
    const descripcion = (values?.descripcion ?? '').trim();
    const updated = await this.mapData.updateRuta(r.id as any, { nombre, descripcion });
    if (updated) {
      await this.messages.toastMsg('Ruta actualizada correctamente', 'success', 1200, 'top');
      await this.load();
    } else {
      await this.messages.toastMsg('No se pudo actualizar la ruta. Intenta nuevamente.', 'danger', 1500, 'top');
    }
  }
}
