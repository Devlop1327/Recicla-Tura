import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { MapDataService } from './map-data.service';

@Injectable({ providedIn: 'root' })
export class RecorridosService {
  private active = signal(false);
  private currentRouteId = signal<string | null>(null);
  private activeRecorridoId = signal<string | null>(null);
  private vehiculoId = signal<string | null>(null);

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
      this.active.set(false);
      this.currentRouteId.set(null);
      this.activeRecorridoId.set(null);
      this.vehiculoId.set(null);
    }
  }

  async stopRecorrido() {
    const recId = this.activeRecorridoId();
    if (recId) {
      await this.mapData.finalizarRecorrido(recId);
    }
    this.active.set(false);
    this.currentRouteId.set(null);
    this.activeRecorridoId.set(null);
    this.vehiculoId.set(null);
  }

  getActiveRecorridoId() {
    return this.activeRecorridoId();
  }

  getVehiculoId() {
    return this.vehiculoId();
  }
}
