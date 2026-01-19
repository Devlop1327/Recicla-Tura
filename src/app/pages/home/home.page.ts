import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import {
  ApiService,
  Ruta,
  Vehiculo,
  UbicacionVehiculo,
} from '../../services/api.service';
import {
  MapDataService,
  RecorridoApiItem,
} from '../../services/map-data.service';
import { SupabaseService } from '../../services/supabase.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class HomePage implements OnInit, OnDestroy {
  rutas = signal<Ruta[]>([]);
  vehiculos = signal<Vehiculo[]>([]);
  ubicacionesVehiculos = signal<UbicacionVehiculo[]>([]);
  recorridos = signal<RecorridoApiItem[]>([]);
  isLoading = signal(true);
  selectedRuta = signal<Ruta | null>(null);
  mapCenter = signal({ lat: 3.8833, lng: -77.0167 });
  mapZoom = signal(13);
  usingApiData = signal(false);
  apiError = signal<string | null>(null);

  private recorridosTimer: any;
  private ubicacionesTimer: any;

  constructor(
    private apiService: ApiService,
    private supabaseService: SupabaseService,
    private router: Router,
    private mapData: MapDataService
  ) {}

  async ngOnInit() {
    console.log('HomePage - Inicializando...');
    await this.loadData();
    this.startRealTimeUpdates();
  }

  ionViewWillEnter() {
    // Refrescar inmediatamente al volver a la pestaña
    this.mapData
      .loadRecorridos()
      .then((recs) => {
        if (!this.destroyed) this.recorridos.set(recs || []);
      })
      .catch(() => {});
    this.enterTimeout = setTimeout(() => {
      if (!this.destroyed) this.loadUbicacionesVehiculos(this.vehiculos());
    }, 2000);
  }

  role(): 'admin' | 'conductor' | 'cliente' | null {
    return this.supabaseService.currentRole?.() ?? null;
  }

  movingVehiclesCount(): number {
    // Solo contar los que están "En Curso" según API en todo el sistema
    return (this.vehiculos() || []).filter((v) => this.isVehiculoEnCurso(v))
      .length;
  }

  displayName(): string {
    const prof = this.supabaseService.currentProfile?.();
    const name = (prof as any)?.full_name || (prof as any)?.fullName || '';
    const email =
      (prof as any)?.email || this.supabaseService.currentUser?.()?.email || '';
    return name || email || 'Usuario';
  }

  roleLabel(): string {
    const r = this.role();
    if (!r) return '';
    return r;
  }

  roleBadgeColor(): string {
    const r = this.role();
    switch (r) {
      case 'admin':
        return 'tertiary';
      case 'conductor':
        return 'success';
      case 'cliente':
        return 'medium';
      default:
        return 'medium';
    }
  }

  // Top 5 rutas más recorridas según frecuencia en "recorridos"
  topRutas(): Ruta[] {
    const recs = this.recorridos() || [];
    const counts = new Map<string, number>();
    for (const r of recs) {
      const rutaId =
        (r as any)?.ruta_id || (r as any)?.rutaId || (r as any)?.ruta?.id;
      if (!rutaId) continue;
      counts.set(rutaId, (counts.get(rutaId) || 0) + 1);
    }
    const rutasArr = this.rutas() || [];
    const rutasMap = new Map<string, Ruta>(
      rutasArr.map((rt) => [rt.id, rt] as [string, Ruta])
    );
    const sortedIds = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
    const top = sortedIds
      .map((id) => rutasMap.get(id))
      .filter((x): x is Ruta => !!x)
      .slice(0, 5);
    if (top.length < 5) {
      const extras = rutasArr
        .filter((r) => !sortedIds.includes(r.id))
        .slice(0, 5 - top.length);
      return [...top, ...extras];
    }
    return top;
  }

  // Lista ordenada para UI: en curso > moviéndose > activos > por placa
  vehiclesForDisplay(): Vehiculo[] {
    const list = this.getVehiculosDeRuta(this.selectedRuta()?.id || '');
    const score = (v: Vehiculo) => {
      const running = this.isVehiculoEnCurso(v) ? 1 : 0;
      const moving = this.isVehiculoMoviendose(v) ? 1 : 0;
      const active = (v as any).activo ? 1 : 0;
      return running * 100 + moving * 10 + active; // prioridad
    };
    return [...list].sort((a, b) => {
      const sb = score(b) - score(a);
      if (sb !== 0) return sb;
      return (a.placa || '').localeCompare(b.placa || '');
    });
  }

  async go(path: string) {
    await this.router.navigateByUrl(path);
  }

  // Métodos de importación removidos para alinear con Home del proyecto raíz

  private ubicacionesChannel: any;
  private initTimeout: any;
  private enterTimeout: any;
  private destroyed = false;

  ngOnDestroy() {
    this.destroyed = true;
    if (this.recorridosTimer) clearInterval(this.recorridosTimer);
    if (this.ubicacionesTimer) clearInterval(this.ubicacionesTimer);
    if (this.ubicacionesChannel) {
      try {
        this.supabaseService.supabase.removeChannel(this.ubicacionesChannel);
      } catch {}
      this.ubicacionesChannel = null;
    }
    if (this.initTimeout) {
      clearTimeout(this.initTimeout);
      this.initTimeout = null;
    }
    if (this.enterTimeout) {
      clearTimeout(this.enterTimeout);
      this.enterTimeout = null;
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
        console.log(
          'HomePage - Vehículos cargados desde el backend:',
          vehiculos
        );
        this.vehiculos.set(vehiculos || []);
        apiSuccess = true;
        await this.loadUbicacionesVehiculos(vehiculos || []);
      } catch (err) {
        console.error('Error cargando vehículos desde el backend:', err);
        apiErrors.push('Error cargando vehículos');
      }

      // Cargar rutas desde la API (este endpoint puede fallar)
      console.log('HomePage - Cargando rutas...');
      try {
        const rutas = await this.apiService.getRutas();
        console.log('HomePage - Rutas cargadas desde el backend:', rutas);
        this.rutas.set(rutas || []);
        apiSuccess = true;
        if ((rutas || []).length > 0) {
          this.selectedRuta.set(rutas![0]);
        }
      } catch (err) {
        console.error('Error cargando rutas desde el backend:', err);
        apiErrors.push('Error cargando rutas');
        // Intentar cargar rutas desde Supabase como fallback
        try {
          console.log(
            'HomePage - Intentando cargar rutas desde Supabase como fallback...'
          );
          const { data: rutasSb, error: rutasSbError } =
            await this.supabaseService.getRutas();
          if (rutasSbError) {
            console.error(
              'HomePage - Error cargando rutas desde Supabase:',
              rutasSbError
            );
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
          console.error(
            'HomePage - Fallback Supabase rutas lanzó excepción:',
            fallbackErr
          );
          this.loadRutasEjemplo();
        }
      }

      // Fallback adicional: si seguimos sin rutas (p. ej. API respondió 200 con []), probar MapDataService
      if ((this.rutas() || []).length === 0) {
        try {
          console.log(
            'HomePage - Cargando rutas desde MapDataService como último recurso...'
          );
          const rutasApi = await this.mapData.loadRutas();
          const now = new Date().toISOString();
          const mapped = (rutasApi || []).map((r: any) => ({
            id: r.id?.toString?.() ?? r.id,
            nombre: r.nombre ?? r.titulo ?? 'Ruta',
            descripcion: r.descripcion ?? '',
            color: '#3B82F6',
            puntos: [],
            activa: true,
            created_at: now,
            updated_at: now,
          }));
          this.rutas.set(mapped);
          if (mapped.length > 0) {
            this.selectedRuta.set(mapped[0]);
            apiSuccess = true;
          }
        } catch (e) {
          console.warn(
            'HomePage - MapDataService.loadRutas() también falló o retornó vacío:',
            e
          );
        }
      }

      // Después de cargar intentamos reflejar el estado
      if (apiSuccess) {
        this.usingApiData.set(true);
        this.apiError.set(
          apiErrors.length > 0
            ? `API parcialmente funcional: ${apiErrors.join(', ')}`
            : null
        );
      } else {
        this.usingApiData.set(false);
        this.apiError.set('API no disponible, usando datos de ejemplo');
        this.loadDatosEjemplo();
      }
      // Cargar recorridos si la API los soporta
      try {
        const recs = await this.mapData.loadRecorridos();
        this.recorridos.set(recs || []);
      } catch {}
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
        updated_at: new Date().toISOString(),
      },
      {
        id: '2',
        nombre: 'Ruta Puerto',
        descripcion: 'Recolección en la zona portuaria',
        color: '#3dc2ff',
        puntos: [],
        activa: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
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
        updated_at: new Date().toISOString(),
      },
      {
        id: '2',
        nombre: 'Ruta Puerto',
        descripcion: 'Recolección en zona portuaria',
        color: '#10B981',
        puntos: [],
        activa: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
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
        updated_at: now,
      },
      {
        id: '2',
        placa: 'XYZ-789',
        modelo: '2021',
        marca: 'Demo',
        activo: false,
        perfil_id: 'demo',
        created_at: now,
        updated_at: now,
      },
    ];

    this.rutas.set(rutasEjemplo);
    this.vehiculos.set(vehiculosEjemplo);
    this.selectedRuta.set(rutasEjemplo[0]);
  }

  loadUbicacionesVehiculos(vehiculos: Vehiculo[]) {
    // Realizar peticiones en paralelo y manejar errores individualmente
    const promises = vehiculos.map((v) =>
      this.apiService
        .getUbicacionVehiculo(v.id)
        .then((u) => ({ ok: true, data: u }))
        .catch((err) => ({ ok: false, err }))
    );

    Promise.all(promises)
      .then((results) => {
        const ubicaciones = this.ubicacionesVehiculos() || [];
        results.forEach((res, idx) => {
          if (res && (res as any).ok) {
            const ubicacion = (res as any).data;
            const vehiculo = vehiculos[idx];
            const index = ubicaciones.findIndex(
              (u) => u.vehiculo_id === vehiculo.id
            );
            if (index >= 0) {
              ubicaciones[index] = ubicacion;
            } else {
              ubicaciones.push(ubicacion);
            }
          } else {
            console.error(
              `Error cargando ubicación del vehículo ${vehiculos[idx].id}:`,
              (res as any).err
            );
          }
        });
        this.ubicacionesVehiculos.set([...ubicaciones]);
      })
      .catch((err) => console.error('Error en loadUbicacionesVehiculos:', err));
  }

  startRealTimeUpdates() {
    // Disparos iniciales escalonados
    this.mapData
      .loadRecorridos()
      .then((recs) => this.recorridos.set(recs || []))
      .catch(() => {});
    this.initTimeout = setTimeout(() => {
      if (this.destroyed) return;
      this.apiService
        .getVehiculos()
        .then((vs: Vehiculo[] | null | undefined) => {
          if (!this.destroyed) this.vehiculos.set(vs || []);
        })
        .catch(() => {});
      if (!this.destroyed) this.loadUbicacionesVehiculos(this.vehiculos());
    }, 5000);

    // Timers separados y desfasados
    // Recorridos cada 20s
    this.recorridosTimer = setInterval(() => {
      this.mapData
        .loadRecorridos()
        .then((recs) => this.recorridos.set(recs || []))
        .catch(() => {});
    }, 20000);

    // Ubicaciones+vehículos cada 25s (desfasado)
    this.ubicacionesTimer = setInterval(() => {
      this.apiService
        .getVehiculos()
        .then((vs: Vehiculo[] | null | undefined) => {
          this.vehiculos.set(vs || []);
        })
        .catch(() => {});
      this.loadUbicacionesVehiculos(this.vehiculos());
    }, 25000);

    // Suscribirse a cambios en tiempo real de Supabase
    // Suscribirse a cambios en tiempo real de Supabase
    this.ubicacionesChannel = this.supabaseService.subscribeToUbicaciones(
      (payload) => {
        console.log('Cambio en ubicaciones:', payload);
        // Actualizar ubicaciones inmediato, refrescar recorridos con un pequeño retraso
        if (!this.destroyed) this.loadUbicacionesVehiculos(this.vehiculos());
        setTimeout(() => {
          if (!this.destroyed)
            this.mapData
              .loadRecorridos()
              .then((recs) => this.recorridos.set(recs || []))
              .catch(() => {});
        }, 3000);
      }
    );
  }

  selectRuta(ruta: Ruta) {
    this.selectedRuta.set(ruta);
  }

  async goToMapa() {
    try {
      console.log('[Home] goToMapa clicked. Attempting navigate to /mapa');
      const ok = await this.router.navigateByUrl('/mapa', {
        replaceUrl: false,
      });
      console.log('[Home] navigateByUrl("/mapa") result:', ok);
    } catch (err) {
      console.error('[Home] navigateByUrl("/mapa") error:', err);
    }
  }

  getVehiculosDeRuta(_rutaId: string): Vehiculo[] {
    const rutaId = this.selectedRuta()?.id || null;
    const list = this.vehiculos();
    const hasRecorridoEnCursoForVehiculo = (vehiculoId: string) => {
      const rec = this.getRecorridoVehiculo(vehiculoId);
      if (!rec) return false;
      if (rutaId && rec.ruta_id !== rutaId) return false;
      return this.isEstadoRunning(rec.estado);
    };
    return list.filter(
      (v) => !!(v as any).activo || hasRecorridoEnCursoForVehiculo(v.id)
    );
  }

  getUbicacionVehiculo(vehiculoId: string): UbicacionVehiculo | undefined {
    return this.ubicacionesVehiculos().find(
      (u) => u.vehiculo_id === vehiculoId
    );
  }

  isVehiculoEnRuta(v: Vehiculo): boolean {
    // Si hay un recorrido activo para la ruta seleccionada, considerar "en ruta"
    const sel = this.selectedRuta();
    if (sel && this.hasActiveRecorridoForRuta(sel.id)) return true;
    const u = this.getUbicacionVehiculo(v.id) as any;
    const speed = typeof u?.velocidad === 'number' ? u.velocidad : 0;
    return speed > 0 || !!(v as any).activo;
  }

  // Estado basado en recorridos del API por vehículo
  private isEstadoRunning(estado: string): boolean {
    const t = (estado || '').toLowerCase().replace(/[_-]/g, ' ').trim();
    return t.includes('progreso') || t.includes('curso');
  }

  private isEstadoCompleted(estado: string): boolean {
    const t = (estado || '').toLowerCase();
    return t.includes('complet');
  }

  private getRecorridoVehiculo(vehiculoId: string): RecorridoApiItem | null {
    const list = this.recorridos() || [];
    const byVehiculo = list.filter((r) => r.vehiculo_id === vehiculoId);
    if (byVehiculo.length === 0) return null;
    const getStart = (r: any) => {
      const s =
        r?.iniciado_en || r?.ts_inicio || r?.created_at || r?.updated_at;
      return s ? new Date(s).getTime() : 0;
    };
    return byVehiculo.sort((a, b) => getStart(b) - getStart(a))[0];
  }

  isVehiculoEnCurso(v: Vehiculo): boolean {
    const rec = this.getRecorridoVehiculo(v.id);
    return !!rec && this.isEstadoRunning(rec.estado);
  }

  isVehiculoMoviendose(v: Vehiculo): boolean {
    const u = this.getUbicacionVehiculo(v.id) as any;
    const speed = typeof u?.velocidad === 'number' ? u.velocidad : 0;
    return speed > 0;
  }

  estadoVehiculo(v: Vehiculo): { text: string; color: string } {
    const rec = this.getRecorridoVehiculo(v.id);
    if (rec) {
      if (this.isEstadoRunning(rec.estado)) {
        // Mostrar texto del API (ej: "En Curso")
        return { text: rec.estado, color: 'success' };
      }
      if (this.isEstadoCompleted(rec.estado)) {
        // Mapear "Completado" -> "Detenido" en UI
        return { text: 'Detenido', color: 'warning' };
      }
      return { text: rec.estado, color: 'warning' };
    }
    // Fallback a velocidad/activo cuando no hay recorrido disponible
    if (this.isVehiculoMoviendose(v))
      return { text: 'En movimiento', color: 'success' };
    if ((v as any).activo) return { text: 'En ruta', color: 'success' };
    return { text: 'Detenido', color: 'warning' };
  }

  private hasActiveRecorridoForRuta(rutaId: string): boolean {
    const isRunning = (s: string) => {
      const t = (s || '').toLowerCase().replace(/[_-]/g, ' ').trim();
      return t.includes('progreso') || t.includes('curso');
    };
    return (this.recorridos() || []).some(
      (r) => r.ruta_id === rutaId && isRunning(r.estado)
    );
  }

  formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getDistanceFromCenter(lat: number, lng: number): number {
    // Cálculo simple de distancia (en km)
    const R = 6371; // Radio de la Tierra en km
    const dLat = ((lat - this.mapCenter().lat) * Math.PI) / 180;
    const dLng = ((lng - this.mapCenter().lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((this.mapCenter().lat * Math.PI) / 180) *
        Math.cos((lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Método de importación de rutas removido para alinear con Home del proyecto raíz
}
