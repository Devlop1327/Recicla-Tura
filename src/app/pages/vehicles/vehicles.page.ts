import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  IonContent, 
  IonHeader, 
  IonTitle, 
  IonToolbar, 
  IonCard, 
  IonCardHeader, 
  IonCardTitle, 
  IonCardContent, 
  IonItem, 
  IonLabel, 
  IonInput, 
  IonButton, 
  IonIcon, 
  IonList, 
  IonGrid, 
  IonRow, 
  IonCol, 
  IonSelect, 
  IonSelectOption, 
  IonBadge,
  IonText,
  IonButtons,
  IonNote,
  AlertController,
  AlertButton
} from '@ionic/angular/standalone';
import { FormsModule } from '@angular/forms';
// Los íconos se importan directamente en el template
import { ApiService, Vehiculo } from '../../services/api.service';

@Component({
  selector: 'app-vehicles',
  templateUrl: './vehicles.page.html',
  styleUrls: ['./vehicles.page.scss'],
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule,
    IonHeader, 
    IonToolbar, 
    IonTitle, 
    IonContent, 
    IonCard, 
    IonCardHeader, 
    IonCardTitle, 
    IonCardContent, 
    IonItem, 
    IonLabel, 
    IonInput, 
    IonButton, 
    IonIcon, 
    IonList, 
    IonGrid, 
    IonRow, 
    IonCol, 
    IonSelect, 
    IonSelectOption, 
    IonBadge,
    IonText,
    IonButtons,
    IonNote
  ]
})
export class VehiclesPage implements OnInit {
  vehiculos = signal<Vehiculo[]>([]);
  isLoading = signal(false);
  // Form
  form = signal<Partial<Vehiculo>>({ placa: '', modelo: '', color: '', capacidad: 0, estado: 'inactivo', ruta_id: '' });
  editingId: string | null = null;

  constructor(
    private api: ApiService,
    private alertCtrl: AlertController
  ) { }

  ngOnInit(): void {
    this.loadVehiculos();
  }

  async loadVehiculos() {
    this.isLoading.set(true);
    try {
      console.log('Cargando vehículos...');
      const v = await this.api.getVehiculos();
      console.log('Vehículos cargados:', v);
      this.vehiculos.set(Array.isArray(v) ? v : []);
    } catch (err) {
      console.error('Error cargando vehículos:', err);
      await this.showAlert('Error', 'No se pudieron cargar los vehículos. Por favor, intente de nuevo.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async save() {
    const payload = this.form();
    
    // Validaciones
    if (!payload.placa || !payload.modelo) {
      await this.showAlert('Error', 'Por favor complete todos los campos requeridos');
      return;
    }

    try {
      if (this.editingId) {
        console.log('Actualizando vehículo:', this.editingId, payload);
        await this.api.updateVehiculo(this.editingId, payload);
      } else {
        console.log('Creando nuevo vehículo:', payload);
        await this.api.createVehiculo(payload);
      }
      
      // Resetear formulario
      this.resetForm();
      
      // Recargar lista
      await this.loadVehiculos();
      
      // Mostrar mensaje de éxito
      await this.showAlert(
        '¡Éxito!', 
        `Vehículo ${this.editingId ? 'actualizado' : 'creado'} correctamente`
      );
      
    } catch (error) {
      console.error('Error guardando vehículo:', error);
      await this.showAlert(
        'Error', 
        `No se pudo ${this.editingId ? 'actualizar' : 'crear'} el vehículo. Por favor, intente de nuevo.`
      );
    }
  }

  resetForm() {
    this.form.set({ placa: '', modelo: '', color: '', capacidad: 0, estado: 'inactivo', ruta_id: '' });
    this.editingId = null;
    // scroll to top to show the form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Método para manejar la edición de un vehículo
  edit(veh: Vehiculo) {
    if (!veh.id) return;
    
    this.editingId = veh.id;
    this.form.set({ 
      placa: veh.placa || '', 
      modelo: veh.modelo || '', 
      color: veh.color || '', 
      capacidad: veh.capacidad || 0, 
      estado: veh.estado || 'inactivo', 
      ruta_id: veh.ruta_id || '' 
    });
    
    // Desplazarse al formulario
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Setters para inputs -- evitan spread en templates
  setPlaca(value: string | null | undefined) {
    const current = this.form();
    this.form.set({ ...current, placa: value ?? '' });
  }

  setModelo(value: string | null | undefined) {
    const current = this.form();
    this.form.set({ ...current, modelo: value ?? '' });
  }

  setColor(value: string | null | undefined) {
    const current = this.form();
    this.form.set({ ...current, color: value ?? '' });
  }

  setCapacidad(value: string | number | null | undefined) {
    const current = this.form();
    const num = value == null ? 0 : Number(value);
    this.form.set({ ...current, capacidad: Number.isFinite(num) ? num : 0 });
  }

  setEstado(value: Vehiculo['estado']) {
    const current = this.form();
    this.form.set({ ...current, estado: value });
  }

  // Método auxiliar para mostrar alertas
  private async showAlert(header: string, message: string, buttons: (string | AlertButton)[] = ['OK']) {
    const alert = await this.alertCtrl.create({
      header,
      message,
      buttons
    });
    await alert.present();
  }

  // Obtener color según el estado del vehículo
  getEstadoColor(estado: string): string {
    switch (estado) {
      case 'activo': return 'success';
      case 'inactivo': return 'medium';
      case 'mantenimiento': return 'warning';
      default: return 'primary';
    }
  }

  setRutaId(value: string) {
    const current = this.form();
    this.form.set({ ...current, ruta_id: value });
  }


  async confirmRemove(veh: Vehiculo) {
    if (!veh.id) return;
    
    const alert = await this.alertCtrl.create({
      header: 'Confirmar eliminación',
      message: `¿Está seguro de eliminar el vehículo ${veh.placa}?`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Eliminar',
          handler: async () => {
            try {
              await this.api.deleteVehiculo(veh.id!);
              
              // Si el vehículo eliminado es el que se está editando, limpiar el formulario
              if (this.editingId === veh.id) {
                this.resetForm();
              }
              
              // Recargar la lista
              await this.loadVehiculos();
              
              await this.showAlert('Eliminado', 'El vehículo ha sido eliminado correctamente');
              
            } catch (error) {
              console.error('Error eliminando vehículo:', error);
              await this.showAlert('Error', 'No se pudo eliminar el vehículo. Por favor, intente de nuevo.');
            }
          }
        }
      ]
    });
    await alert.present();
  }

  // trackBy function for ngFor
  trackByVehId(index: number, item: Vehiculo) {
    return item?.id;
  }
}
