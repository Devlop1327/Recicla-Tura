import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { MapDataService } from './map-data.service';

@Injectable({ providedIn: 'root' })
export class RecorridosService {
  private active = signal(false);
  private currentRouteId = signal<string | null>(null);
  private activeRecorridoId = signal<string | null>(null);
  private vehiculoId = signal<string | null>(null);
  private currentRouteName = signal<string | null>(null);

  constructor(private supabase: SupabaseService, private mapData: MapDataService) {}

  hasActiveRecorrido() {
    return this.active();
  }

  async getAssignedRutas() {
    const rutas = await this.mapData.loadRutas();
    return (rutas || []).map(r => ({ id: r.id, nombre: r.nombre || r.nombre_ruta || 'Ruta' }));
  }

  async startRecorrido(routeId: string, vehiculoId?: string) {
    this.currentRouteId.set(routeId);
    this.vehiculoId.set(vehiculoId ?? null);
    const rec = await this.mapData.iniciarRecorrido(routeId, vehiculoId);
    if (rec?.id) {
      this.activeRecorridoId.set(rec.id);
      this.active.set(true);
    } else {
      // Fallback local para habilitar UI y guardar en Supabase aunque la API externa no soporte recorridos
      const localId = `local-${routeId}-${Date.now()}`;
      this.activeRecorridoId.set(localId);
      this.active.set(true);
    }
  }

  async stopRecorrido() {
    const recId = this.activeRecorridoId();
    if (recId) {
      // Intentar finalizar en API externa solo si no es un id local
      if (!recId.startsWith('local-')) {
        await this.mapData.finalizarRecorrido(recId);
      }
    }
    this.active.set(false);
    this.currentRouteId.set(null);
    this.activeRecorridoId.set(null);
    this.vehiculoId.set(null);
    this.currentRouteName.set(null);
  }

  getActiveRecorridoId() {
    return this.activeRecorridoId();
  }

  getVehiculoId() {
    return this.vehiculoId();
  }

  setCurrentRouteMeta(id: string, name?: string | null) {
    this.currentRouteId.set(id);
    this.currentRouteName.set(name ?? null);
  }

  getCurrentRouteId() {
    return this.currentRouteId();
  }

  getCurrentRouteName() {
    return this.currentRouteName();
  }

  async refreshActiveFromApi() {
    try {
      const list = await this.mapData.loadRecorridos();
      const running = (list || []).find((r: any) => (r.estado || '').toLowerCase().includes('progreso'));
      if (running) {
        this.activeRecorridoId.set(running.id);
        this.currentRouteId.set(running.ruta_id ?? this.currentRouteId());
        this.active.set(true);
        return true;
      } else {
        this.active.set(!!this.activeRecorridoId());
        return this.active();
      }
    } catch {
      return this.active();
    }
  }
}

