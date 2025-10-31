import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ApiService, Ruta, Vehiculo, UbicacionVehiculo } from '../../services/api.service';
import { MapDataService } from '../../services/map-data.service';
import { SupabaseService } from '../../services/supabase.service';
import { SyncService } from '../../services/sync.service';
import { Router } from '@angular/router';

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
  isImporting = signal(false);
  importMessage = signal<string | null>(null);
  selectedRuta = signal<Ruta | null>(null);
  mapCenter = signal({ lat: 3.8833, lng: -77.0167 });
  mapZoom = signal(13);
  usingApiData = signal(false);
  apiError = signal<string | null>(null);

  private refreshInterval: any;

  constructor(
    private apiService: ApiService,
    private supabaseService: SupabaseService,
    private router: Router,
    private mapData: MapDataService,
    private sync: SyncService
  ) {}

  async ngOnInit() {
    console.log('HomePage - Inicializando...');
    await this.loadData();
    this.startRealTimeUpdates();
  }

  role(): 'admin' | 'conductor' | 'cliente' | null {
    return this.supabaseService.currentRole?.() ?? null;
  }

  movingVehiclesCount(): number {
    return (this.ubicacionesVehiculos() || []).filter(u => (u as any).velocidad && (u as any).velocidad > 0).length;
  }

  async go(path: string) {
    await this.router.navigateByUrl(path);
  }

  // Importar calles desde la API pública a Supabase (tabla 'calles')
  async importCallesToSupabase() {
    try {
      this.isImporting.set(true);
      this.importMessage.set(null);
      const { inserted, error } = await this.sync.syncCallesFromApi();
      if (error) {
        console.error('[Home] importCallesToSupabase error:', error);
        this.importMessage.set('Error al importar calles a Supabase');
      } else {
        this.importMessage.set(`Importación de calles completada: ${inserted} registros`);
      }
    } catch (e) {
      console.error('[Home] importCallesToSupabase exception:', e);
      this.importMessage.set('Excepción durante la importación de calles');
    } finally {
      this.isImporting.set(false);
    }
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
        // Intentar cargar rutas desde Supabase como fallback
        try {
          console.log('HomePage - Intentando cargar rutas desde Supabase como fallback...');
          const { data: rutasSb, error: rutasSbError } = await this.supabaseService.getRutas();
          if (rutasSbError) {
            console.error('HomePage - Error cargando rutas desde Supabase:', rutasSbError);
            // Cargar rutas de ejemplo si también falla Supabase
            this.loadRutasEjemplo();
          } else {
            console.log('HomePage - Rutas cargadas desde Supabase:', rutasSb);
            this.rutas.set((rutasSb as any) || []);
            if ((rutasSb as any)?.length > 0) {
              this.selectedRuta.set((rutasSb as any)[0]);
            }
            apiSuccess = true;
          }
        } catch (fallbackErr) {
          console.error('HomePage - Fallback Supabase rutas lanzó excepción:', fallbackErr);
          this.loadRutasEjemplo();
        }
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

    const now = new Date().toISOString();
    const vehiculosEjemplo: Vehiculo[] = [
      {
        id: '1',
        placa: 'ABC-123',
        modelo: '2020',
        marca: 'Ejemplo',
        activo: true,
        perfil_id: 'demo',
        created_at: now,
        updated_at: now
      },
      {
        id: '2',
        placa: 'XYZ-789',
        modelo: '2021',
        marca: 'Demo',
        activo: false,
        perfil_id: 'demo',
        created_at: now,
        updated_at: now
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

  async goToMapa() {
    try {
      console.log('[Home] goToMapa clicked. Attempting navigate to /mapa');
      const ok = await this.router.navigateByUrl('/mapa', { replaceUrl: false });
      console.log('[Home] navigateByUrl("/mapa") result:', ok);
    } catch (err) {
      console.error('[Home] navigateByUrl("/mapa") error:', err);
    }
  }

  getVehiculosDeRuta(_rutaId: string): Vehiculo[] {
    return this.vehiculos().filter(v => !!(v as any).activo);
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

  // Importar rutas desde la API pública a Supabase (tabla 'rutas')
  async importRutasToSupabase() {
    try {
      this.isImporting.set(true);
      this.importMessage.set(null);
      // Cargar rutas desde API externa
      const apiRutas = await this.mapData.loadRutas();
      const rows = (apiRutas || []).map((r: any) => {
        const nombre = r.nombre || r.nombre_ruta || 'Sin nombre';
        const descripcion = r.descripcion || r.descripcion_ruta || null;
        // Algunas APIs retornan shape como string JSON; respetar si existe
        const shape = r.shape ? r.shape : (r.shape_ruta ? r.shape_ruta : null);
        return {
          id: r.id,
          nombre,
          descripcion,
          shape,
          activa: true
        };
      });
      const { data, error } = await this.supabaseService.upsertRutas(rows);
      if (error) {
        console.error('[Home] importRutasToSupabase error:', error);
        this.importMessage.set('Error al importar rutas a Supabase');
      } else {
        const count = Array.isArray(data) ? data.length : rows.length;
        this.importMessage.set(`Importación completada: ${count} rutas`);
      }
    } catch (e) {
      console.error('[Home] importRutasToSupabase exception:', e);
      this.importMessage.set('Excepción durante la importación');
    } finally {
      this.isImporting.set(false);
    }
  }
}
