import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ApiService, Ruta, Vehiculo, UbicacionVehiculo } from '../../services/api.service';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class HomePage implements OnInit, OnDestroy {
  rutas = signal<Ruta[]>([]);
  vehiculos = signal<Vehiculo[]>([]);
  ubicacionesVehiculos = signal<UbicacionVehiculo[]>([]);
  isLoading = signal(true);
  selectedRuta = signal<Ruta | null>(null);
  mapCenter = signal({ lat: 3.8833, lng: -77.0167 });
  mapZoom = signal(13);
  usingApiData = signal(false);
  apiError = signal<string | null>(null);

  private refreshInterval: any;

  constructor(
    private apiService: ApiService,
    private supabaseService: SupabaseService
  ) {}

  async ngOnInit() {
    console.log('HomePage - Inicializando...');
    await this.loadData();
    this.startRealTimeUpdates();
  }

  ngOnDestroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  async loadData() {
    this.isLoading.set(true);
    console.log('HomePage - Cargando datos...');
    
    let apiSuccess = false;
    let apiErrors: string[] = [];

    try {
      // Cargar vehículos desde la API (este endpoint funciona)
      console.log('HomePage - Cargando vehículos...');
      try {
        const vehiculos = await this.apiService.getVehiculos();
        console.log('HomePage - Vehículos cargados desde API:', vehiculos);
        this.vehiculos.set(vehiculos || []);
        apiSuccess = true;
        await this.loadUbicacionesVehiculos(vehiculos || []);
      } catch (err) {
        console.error('Error cargando vehículos desde API:', err);
        apiErrors.push('Error cargando vehículos');
      }

      // Cargar rutas desde la API (este endpoint puede fallar)
      console.log('HomePage - Cargando rutas...');
      try {
        const rutas = await this.apiService.getRutas();
        console.log('HomePage - Rutas cargadas desde API:', rutas);
        this.rutas.set(rutas || []);
        apiSuccess = true;
        if ((rutas || []).length > 0) {
          this.selectedRuta.set(rutas![0]);
        }
      } catch (err) {
        console.error('Error cargando rutas desde API:', err);
        apiErrors.push('Error cargando rutas');
        // Cargar rutas de ejemplo si falla la API
        this.loadRutasEjemplo();
      }

      // Después de cargar intentamos reflejar el estado
      if (apiSuccess) {
        this.usingApiData.set(true);
        this.apiError.set(apiErrors.length > 0 ? `API parcialmente funcional: ${apiErrors.join(', ')}` : null);
      } else {
        this.usingApiData.set(false);
        this.apiError.set('API no disponible, usando datos de ejemplo');
        this.loadDatosEjemplo();
      }
      this.isLoading.set(false);

    } catch (error) {
      console.error('Error cargando datos:', error);
      this.loadDatosEjemplo();
      this.isLoading.set(false);
    }
  }

  loadRutasEjemplo() {
    console.log('HomePage - Cargando rutas de ejemplo...');
    const rutasEjemplo: Ruta[] = [
      {
        id: '1',
        nombre: 'Ruta Centro',
        descripcion: 'Recolección en el centro de Buenaventura',
        color: '#3880ff',
        puntos: [],
        activa: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '2',
        nombre: 'Ruta Puerto',
        descripcion: 'Recolección en la zona portuaria',
        color: '#3dc2ff',
        puntos: [],
        activa: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    this.rutas.set(rutasEjemplo);
    if (rutasEjemplo.length > 0) {
      this.selectedRuta.set(rutasEjemplo[0]);
    }
  }

  loadDatosEjemplo() {
    console.log('HomePage - Cargando datos de ejemplo (API no disponible)...');
    this.usingApiData.set(false);
    // Datos de ejemplo para Buenaventura
    const rutasEjemplo: Ruta[] = [
      {
        id: '1',
        nombre: 'Ruta Centro',
        descripcion: 'Recolección en el centro de Buenaventura',
        color: '#3B82F6',
        puntos: [],
        activa: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '2',
        nombre: 'Ruta Puerto',
        descripcion: 'Recolección en zona portuaria',
        color: '#10B981',
        puntos: [],
        activa: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    const vehiculosEjemplo: Vehiculo[] = [
      {
        id: '1',
        placa: 'ABC-123',
        modelo: '2020',
        color: 'Blanco',
        capacidad: 5000,
        estado: 'activo',
        ruta_id: '1',
        created_at: new Date().toISOString()
      },
      {
        id: '2',
        placa: 'XYZ-789',
        modelo: '2021',
        color: 'Azul',
        capacidad: 3000,
        estado: 'activo',
        ruta_id: '2',
        created_at: new Date().toISOString()
      }
    ];

    this.rutas.set(rutasEjemplo);
    this.vehiculos.set(vehiculosEjemplo);
    this.selectedRuta.set(rutasEjemplo[0]);
  }

  loadUbicacionesVehiculos(vehiculos: Vehiculo[]) {
    // Realizar peticiones en paralelo y manejar errores individualmente
    const promises = vehiculos.map(v =>
      this.apiService.getUbicacionVehiculo(v.id).then(u => ({ ok: true, data: u })).catch(err => ({ ok: false, err }))
    );

    Promise.all(promises).then(results => {
      const ubicaciones = this.ubicacionesVehiculos() || [];
      results.forEach((res, idx) => {
        if (res && (res as any).ok) {
          const ubicacion = (res as any).data;
          const vehiculo = vehiculos[idx];
          const index = ubicaciones.findIndex(u => u.vehiculo_id === vehiculo.id);
          if (index >= 0) {
            ubicaciones[index] = ubicacion;
          } else {
            ubicaciones.push(ubicacion);
          }
        } else {
          console.error(`Error cargando ubicación del vehículo ${vehiculos[idx].id}:`, (res as any).err);
        }
      });
      this.ubicacionesVehiculos.set([...ubicaciones]);
    }).catch(err => console.error('Error en loadUbicacionesVehiculos:', err));
  }

  startRealTimeUpdates() {
    // Actualizar ubicaciones cada 30 segundos
    this.refreshInterval = setInterval(() => {
      this.loadUbicacionesVehiculos(this.vehiculos());
    }, 30000);

    // Suscribirse a cambios en tiempo real de Supabase
    this.supabaseService.subscribeToUbicaciones((payload) => {
      console.log('Cambio en ubicaciones:', payload);
      this.loadUbicacionesVehiculos(this.vehiculos());
    });
  }

  selectRuta(ruta: Ruta) {
    this.selectedRuta.set(ruta);
  }

  getVehiculosDeRuta(rutaId: string): Vehiculo[] {
    return this.vehiculos().filter(v => v.ruta_id === rutaId && v.estado === 'activo');
  }

  getUbicacionVehiculo(vehiculoId: string): UbicacionVehiculo | undefined {
    return this.ubicacionesVehiculos().find(u => u.vehiculo_id === vehiculoId);
  }

  formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('es-CO', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }

  getDistanceFromCenter(lat: number, lng: number): number {
    // Cálculo simple de distancia (en km)
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat - this.mapCenter().lat) * Math.PI / 180;
    const dLng = (lng - this.mapCenter().lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.mapCenter().lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
}
