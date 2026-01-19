import { Component, signal, OnInit, computed } from '@angular/core';
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
  IonBadge,
  IonText,
  IonButtons,
  IonNote,
  IonToggle,
  IonSpinner,
  AlertController,
  AlertButton,
} from '@ionic/angular/standalone';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';

interface Vehiculo {
  id?: string;
  placa: string;
  modelo: string | null;
  estado?: 'disponible' | 'en_ruta' | 'mantenimiento' | string;
  marca: string | null;
  activo: boolean;
  perfil_id?: string;
  created_at?: string;
  updated_at?: string;
}

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
    IonBadge,
    IonText,
    IonButtons,
    IonNote,
    IonToggle,
    IonSpinner,
  ],
})
export class VehiclesPage implements OnInit {
  vehiculos = signal<Vehiculo[]>([]);
  isLoading = signal(false);
  // Form alineado con API externa
  form = signal<
    Partial<Pick<Vehiculo, 'placa' | 'modelo' | 'marca' | 'activo'>>
  >({ placa: '', modelo: '', marca: '', activo: true });
  editingId: string | null = null;
  showFormErrors = false;

  isAdmin = computed(() => this.supabase.currentRole() === 'admin');

  constructor(
    private supabase: SupabaseService,
    private alertCtrl: AlertController
  ) {}

  ngOnInit(): void {
    this.loadVehiculos();
  }

  async loadVehiculos() {
    this.isLoading.set(true);
    try {
      console.log('Cargando vehículos...');
      const { data, error } = await this.supabase.getVehiculos();
      if (error) {
        console.error('Error cargando vehículos desde Supabase:', error);
        await this.showAlert(
          'Error',
          'No se pudieron cargar los vehículos. Por favor, intente de nuevo.'
        );
        this.vehiculos.set([]);
        return;
      }
      console.log('Vehículos cargados:', data);
      this.vehiculos.set(Array.isArray(data) ? (data as Vehiculo[]) : []);
    } catch (err) {
      console.error('Error cargando vehículos:', err);
      await this.showAlert(
        'Error',
        'No se pudieron cargar los vehículos. Por favor, intente de nuevo.'
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  async save() {
    if (!this.isAdmin()) {
      await this.showAlert(
        'Sin permisos',
        'Solo un administrador puede crear o editar vehículos.'
      );
      return;
    }

    const payload = this.form();

    // Validaciones
    if (!payload.placa || !payload.modelo) {
      await this.showAlert(
        'Error',
        'Por favor complete todos los campos requeridos'
      );
      return;
    }

    try {
      const wasEditing = !!this.editingId;
      if (wasEditing) {
        const id = this.editingId as string;
        console.log('Actualizando vehículo:', id, payload);
        await this.supabase.updateVehiculo(id, {
          placa: payload.placa!,
          modelo: payload.modelo ?? null,
          marca: payload.marca ?? null,
          activo: payload.activo ?? true,
        });
      } else {
        console.log('Creando nuevo vehículo:', payload);
        await this.supabase.createVehiculo({
          placa: payload.placa!,
          modelo: payload.modelo ?? null,
          marca: payload.marca ?? null,
          activo: payload.activo ?? true,
        });
      }

      // Resetear formulario
      this.resetForm();

      // Recargar lista
      await this.loadVehiculos();

      // Mostrar mensaje de éxito
      await this.showAlert(
        '¡Éxito!',
        `Vehículo ${wasEditing ? 'editado' : 'creado'} correctamente`
      );
    } catch (error) {
      console.error('Error guardando vehículo:', error);
      await this.showAlert(
        'Error',
        `No se pudo ${
          this.editingId ? 'editar' : 'crear'
        } el vehículo. Por favor, intente de nuevo.`
      );
    }
  }

  resetForm() {
    this.form.set({ placa: '', modelo: '', marca: '', activo: true });
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
      marca: veh.marca || '',
      activo: !!veh.activo,
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

  setMarca(value: string | null | undefined) {
    const current = this.form();
    this.form.set({ ...current, marca: value ?? '' });
  }

  setActivo(value: boolean | null | undefined) {
    const current = this.form();
    this.form.set({ ...current, activo: !!value });
  }

  // Método auxiliar para mostrar alertas
  private async showAlert(
    header: string,
    message: string,
    buttons: (string | AlertButton)[] = ['OK']
  ) {
    const alert = await this.alertCtrl.create({
      header,
      message,
      buttons,
    });
    await alert.present();
  }

  // Obtener color según si está activo
  getActivoColor(activo: boolean): string {
    return activo ? 'success' : 'medium';
  }

  // Sin ruta en el modelo expuesto por la API externa

  async confirmRemove(veh: Vehiculo) {
    if (!veh.id) return;

    if (!this.isAdmin()) {
      await this.showAlert(
        'Sin permisos',
        'Solo un administrador puede eliminar vehículos.'
      );
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Confirmar eliminación',
      message: `¿Está seguro de eliminar el vehículo ${veh.placa}?`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
        },
        {
          text: 'Eliminar',
          handler: async () => {
            try {
              await this.supabase.deleteVehiculo(veh.id!);

              // Si el vehículo eliminado es el que se está editando, limpiar el formulario
              if (this.editingId === veh.id) {
                this.resetForm();
              }

              // Recargar la lista
              await this.loadVehiculos();

              await this.showAlert(
                'Eliminado',
                'El vehículo ha sido eliminado correctamente'
              );
            } catch (error) {
              console.error('Error eliminando vehículo:', error);
              await this.showAlert(
                'Error',
                'No se pudo eliminar el vehículo. Por favor, intente de nuevo.'
              );
            }
          },
        },
      ],
    });
    await alert.present();
  }

  // trackBy function for ngFor
  trackByVehId(index: number, item: Vehiculo) {
    return item?.id;
  }
}
