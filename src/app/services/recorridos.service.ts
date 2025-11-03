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
  private promoteTimer: any = null;

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
      const localId = `local-${routeId}-${Date.now()}`;
      this.activeRecorridoId.set(localId);
      this.active.set(true);
      this.startPromotionPolling();
    }
  }

  async stopRecorrido() {
    await this.refreshActiveFromApi();
    let targetId: string | null = this.activeRecorridoId();
    if (targetId && targetId.startsWith('local-')) {
      const resolved = await this.resolveRealRecorridoId();
      targetId = resolved || null;
    }
    if (!targetId) {
      return false;
    }
    const ok = await this.mapData.finalizarRecorrido(targetId);
    if (!ok) {
      return false;
    }
    this.stopPromotionPolling();
    this.active.set(false);
    this.currentRouteId.set(null);
    this.activeRecorridoId.set(null);
    this.vehiculoId.set(null);
    this.currentRouteName.set(null);
    return true;
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
      const running = (list || []).find((r: any) => {
        const t = (r.estado || '').toLowerCase().replace(/[_-]/g, ' ').trim();
        return t.includes('progreso') || t.includes('curso');
      });
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

  private async resolveRealRecorridoId(): Promise<string | null> {
    try {
      const rutaId = this.currentRouteId();
      const list = await this.mapData.loadRecorridos();
      const running = (list || []).find((r: any) => {
        const estado = (r.estado || '').toLowerCase().replace(/[_-]/g, ' ').trim();
        const okEstado = estado.includes('progreso') || estado.includes('curso');
        const okRuta = rutaId ? r.ruta_id === rutaId : true;
        return okEstado && okRuta;
      });
      if (running?.id) return running.id;
      const anyRunning = (list || []).find((r: any) => {
        const estado = (r.estado || '').toLowerCase().replace(/[_-]/g, ' ').trim();
        return estado.includes('progreso') || estado.includes('curso');
      });
      return anyRunning?.id ?? null;
    } catch {
      return null;
    }
  }

  private startPromotionPolling() {
    if (this.promoteTimer) return;
    this.promoteTimer = setInterval(async () => {
      const id = this.activeRecorridoId();
      if (!id || !id.startsWith('local-')) {
        this.stopPromotionPolling();
        return;
      }
      const ok = await this.refreshActiveFromApi();
      const newId = this.activeRecorridoId();
      if (ok && newId && !newId.startsWith('local-')) {
        this.stopPromotionPolling();
      }
    }, 3000);
  }

  private stopPromotionPolling() {
    if (this.promoteTimer) {
      clearInterval(this.promoteTimer);
      this.promoteTimer = null;
    }
  }
}
