import { Component, signal } from '@angular/core';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { MapDataService, RutaApiItem } from '../../services/map-data.service';

@Component({
  selector: 'app-admin-routes',
  standalone: true,
  imports: [IonicModule, CommonModule],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button autoHide="false" menu="admin-menu"></ion-menu-button>
        </ion-buttons>
        <ion-title>Rutas</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="onRefresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>
      <ion-list inset>
        @for (r of rutas(); track r.id) {
          <ion-item-sliding>
            <ion-item>
              <ion-label>
                <h2>{{ r.nombre || r.nombre_ruta }}</h2>
                <p>{{ r.descripcion || r.descripcion_ruta }}</p>
              </ion-label>
              <ion-buttons slot="end">
                <ion-button fill="clear" color="medium" (click)="edit(r)" aria-label="Editar">
                  <ion-icon name="create-outline"></ion-icon>
                </ion-button>
                <ion-button fill="clear" color="danger" (click)="confirmDelete(r)" aria-label="Eliminar">
                  <ion-icon name="trash-outline"></ion-icon>
                </ion-button>
              </ion-buttons>
            </ion-item>
            <ion-item-options side="start">
              <ion-item-option color="medium" (click)="edit(r)">
                <ion-icon slot="start" name="create-outline"></ion-icon>
                Editar
              </ion-item-option>
            </ion-item-options>
            <ion-item-options side="end">
              <ion-item-option color="danger" (click)="confirmDelete(r)">
                <ion-icon slot="start" name="trash-outline"></ion-icon>
                Eliminar
              </ion-item-option>
            </ion-item-options>
          </ion-item-sliding>
        }
        @if ((rutas() || []).length === 0) {
          <ion-item lines="none">
            <ion-label>No hay rutas</ion-label>
          </ion-item>
        }
      </ion-list>
      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button color="primary" (click)="create()" aria-label="Nueva ruta">
          <ion-icon name="add"></ion-icon>
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
})
export class AdminRoutesPage {
  rutas = signal<RutaApiItem[]>([]);

  constructor(private mapData: MapDataService, private alertCtrl: AlertController, private toast: ToastController) {}

  async ionViewWillEnter() {
    await this.load();
  }

  private async load() {
    const list = await this.mapData.loadRutas();
    this.rutas.set(list);
  }

  async onRefresh(ev: CustomEvent) {
    try {
      await this.load();
    } finally {
      (ev.target as HTMLIonRefresherElement)?.complete?.();
    }
  }

  async confirmDelete(r: RutaApiItem) {
    const alert = await this.alertCtrl.create({
      header: 'Eliminar ruta',
      message: `¿Eliminar "${r.nombre || r.nombre_ruta}"?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive' }
      ]
    });
    await alert.present();
    const res = await alert.onDidDismiss();
    if (res.role !== 'destructive') return;
    const ok = await this.mapData.deleteRuta(r.id as any);
    if (ok) {
      const t = await this.toast.create({ message: 'Ruta eliminada', duration: 1200, color: 'success' });
      t.present();
      await this.load();
    } else {
      const t = await this.toast.create({ message: 'No se pudo eliminar', duration: 1500, color: 'danger' });
      t.present();
    }
  }

  async create() {
    const alert = await this.alertCtrl.create({
      header: 'Crear ruta',
      inputs: [
        { name: 'nombre', type: 'text', placeholder: 'Nombre', attributes: { maxlength: 120 } },
        { name: 'descripcion', type: 'text', placeholder: 'Descripción', attributes: { maxlength: 200 } }
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Crear', role: 'confirm' }
      ]
    });
    await alert.present();
    const res = await alert.onDidDismiss();
    if (res.role !== 'confirm') return;
    const values = (res.data as any)?.values || (res.data as any);
    const nombre = values?.nombre?.trim();
    const descripcion = values?.descripcion?.trim();
    if (!nombre) {
      const t = await this.toast.create({ message: 'Nombre requerido', duration: 1200, color: 'warning' });
      t.present();
      return;
    }
    const created = await this.mapData.createRuta({ nombre, descripcion, shape: undefined, callesIds: [] });
    if (created) {
      const t = await this.toast.create({ message: 'Ruta creada', duration: 1200, color: 'success' });
      t.present();
      await this.load();
    } else {
      const t = await this.toast.create({ message: 'No se pudo crear', duration: 1500, color: 'danger' });
      t.present();
    }
  }

  async edit(r: RutaApiItem) {
    const alert = await this.alertCtrl.create({
      header: 'Editar ruta',
      inputs: [
        { name: 'nombre', type: 'text', placeholder: 'Nombre', value: r.nombre || r.nombre_ruta || '' },
        { name: 'descripcion', type: 'text', placeholder: 'Descripción', value: r.descripcion || r.descripcion_ruta || '' }
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Guardar', role: 'confirm' }
      ]
    });
    await alert.present();
    const res = await alert.onDidDismiss();
    if (res.role !== 'confirm') return;
    const values = (res.data as any)?.values || (res.data as any);
    const nombre = (values?.nombre ?? '').trim();
    const descripcion = (values?.descripcion ?? '').trim();
    const updated = await this.mapData.updateRuta(r.id as any, { nombre, descripcion });
    if (updated) {
      const t = await this.toast.create({ message: 'Ruta actualizada', duration: 1200, color: 'success' });
      t.present();
      await this.load();
    } else {
      const t = await this.toast.create({ message: 'No se pudo actualizar', duration: 1500, color: 'danger' });
      t.present();
    }
  }
}
