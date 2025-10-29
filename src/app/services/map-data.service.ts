import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { SupabaseService } from './supabase.service';

export type LineStringGeoJSON = {
  type: 'LineString';
  coordinates: [number, number][]; // [lng, lat]
};

export interface CalleApiItem {
  id: string;
  nombre: string;
  shape: string; // stringified GeoJSON
}

export interface RutaApiItem {
  id: string;
  nombre?: string;
  nombre_ruta?: string;
  descripcion?: string;
  descripcion_ruta?: string;
  shape?: string;
}

export interface RecorridoApiItem {
  id: string;
  ruta_id: string;
  perfil_id: string;
  estado: 'en_progreso' | 'finalizado' | string;
  iniciado_en: string;
  finalizado_en?: string;
}

export interface PosicionApiItem {
  id: string;
  recorrido_id: string;
  lat: number;
  lng: number;
  velocidad?: number;
  timestamp: string;
}

@Injectable({ providedIn: 'root' })
export class MapDataService {
  private readonly baseUrl = environment.api.baseUrl.replace(/\/?$/, '');
  // Del usuario: profile id requerido por el API
  private readonly profileId = environment.api.profileId;

  // Signals for state (if needed in other pages later)
  calles = signal<CalleApiItem[]>([]);
  rutas = signal<RutaApiItem[]>([]);
  recorridos = signal<RecorridoApiItem[]>([]);
  loading = signal<boolean>(false);
  error = signal<string | null>(null);

  constructor(private http: HttpClient, private supabase: SupabaseService) {}

  async loadCalles(): Promise<CalleApiItem[]> {
    try {
      this.loading.set(true);
      this.error.set(null);
      // 1) Intentar desde Supabase primero
      const sb = await this.loadCallesFromSupabase();
      if (sb.length > 0) {
        console.log('[MapDataService] Calles desde Supabase ->', sb.length);
        this.calles.set(sb);
        return sb;
      }
      // 2) Fallback al API externo
      console.log('[MapDataService] GET /calles (fallback API externo)');
      const data = await firstValueFrom(
        this.http.get<{ data: CalleApiItem[] }>(`${this.baseUrl}/calles`)
      );
      const items = data?.data ?? [];
      console.log('[MapDataService] /calles (API externo) ->', items.length, 'items');
      this.calles.set(items);
      return items;
    } catch (e: any) {
      const msg = e?.message ?? 'Error al cargar calles';
      console.error('[MapDataService] /calles error:', e);
      this.error.set(msg);
      return [];
    } finally {
      this.loading.set(false);
    }
  }

  private async loadCallesFromSupabase(): Promise<CalleApiItem[]> {
    try {
      const { data, error } = await this.supabase.getCalles();
      if (error) {
        console.warn('[MapDataService] Supabase getCalles error:', error);
        return [];
      }
      const rows = Array.isArray(data) ? data : [];
      const items: CalleApiItem[] = rows
        .map((r: any) => {
          const id = r.id ?? r.uuid ?? r.pk ?? undefined;
          const nombre = r.nombre ?? r.name ?? '';
          let shapeStr: string | null = null;
          if (typeof r.shape === 'string') {
            shapeStr = r.shape;
          } else if (r.shape) {
            try { shapeStr = JSON.stringify(r.shape); } catch { shapeStr = null; }
          }
          if (!id || !shapeStr) return null;
          return { id, nombre, shape: shapeStr } as CalleApiItem;
        })
        .filter((x): x is CalleApiItem => !!x);
      return items;
    } catch (e) {
      console.warn('[MapDataService] loadCallesFromSupabase exception:', e);
      return [];
    }
  }

  async createCalle(payload: { nombre: string; shape: any }): Promise<CalleApiItem | null> {
    try {
      const body: any = {
        nombre: payload.nombre,
        shape: payload.shape ? JSON.stringify(payload.shape) : undefined
      };
      console.log('[MapDataService] POST /calles =>', body);
      const resp = await firstValueFrom(
        this.http.post<{ data: CalleApiItem }>(`${this.baseUrl}/calles`, body)
      );
      const created: CalleApiItem | null = resp?.data ?? null;
      if (created) {
        const curr = this.calles();
        this.calles.set([created, ...curr]);
        return created;
      }
      return null;
    } catch (e: any) {
      console.warn('[MapDataService] POST /calles falló, intentando Supabase...', e?.message || e);
      try {
        const shapeStr = payload.shape ? JSON.stringify(payload.shape) : '';
        const { data, error } = await this.supabase.createCalle({ nombre: payload.nombre, shape: shapeStr });
        if (error) {
          console.error('[MapDataService] Supabase createCalle error:', error);
          return null;
        }
        const created: CalleApiItem = {
          id: (data?.id ?? data?.uuid ?? data?.pk ?? '').toString(),
          nombre: data?.nombre ?? payload.nombre,
          shape: typeof data?.shape === 'string' ? data.shape : shapeStr
        };
        const curr = this.calles();
        this.calles.set([created, ...curr]);
        return created;
      } catch (ex) {
        console.error('[MapDataService] Fallback Supabase createCalle exception:', ex);
        return null;
      }
    }
  }

  // Rutas: listar por perfil, obtener detalle
  async loadRutas(): Promise<RutaApiItem[]> {
    try {
      this.loading.set(true);
      this.error.set(null);
      console.log('[MapDataService] GET /rutas?perfil_id=', this.profileId);
      let data: { data: RutaApiItem[] } | undefined;
      try {
        data = await firstValueFrom(
          this.http.get<{ data: RutaApiItem[] }>(`${this.baseUrl}/rutas`, {
            params: { perfil_id: this.profileId }
          })
        );
      } catch (e: any) {
        const status = e?.status;
        console.warn('[MapDataService] Primer intento /rutas falló', { status, message: e?.message || e });
        if (status && status >= 500) {
          await new Promise((r) => setTimeout(r, 1500));
          console.log('[MapDataService] Reintentando /rutas con perfil_id tras 1.5s...');
          data = await firstValueFrom(
            this.http.get<{ data: RutaApiItem[] }>(`${this.baseUrl}/rutas`, {
              params: { perfil_id: this.profileId }
            })
          );
        } else {
          throw e;
        }
      }
      const items = data?.data ?? [];
      console.log('[MapDataService] /rutas (con perfil_id) ->', items.length, 'items');
      this.rutas.set(items);
      return items;
    } catch (e: any) {
      console.warn('[MapDataService] /rutas con perfil_id falló, intentando sin parámetro...', { status: e?.status, message: e?.message || e });
      try {
        const data2 = await firstValueFrom(
          this.http.get<{ data: RutaApiItem[] }>(`${this.baseUrl}/rutas`)
        );
        const items2 = data2?.data ?? [];
        console.log('[MapDataService] /rutas (sin perfil_id) ->', items2.length, 'items');
        this.rutas.set(items2);
        return items2;
      } catch (e2: any) {
        const msg = e2?.message ?? 'Error al cargar rutas';
        console.error('[MapDataService] /rutas error final:', e2);
        this.error.set(msg);
        return [];
      }
    } finally {
      this.loading.set(false);
    }
  }

  async getRuta(id: string): Promise<RutaApiItem | null> {
    try {
      const data = await firstValueFrom(
        this.http.get<{ data: RutaApiItem }>(`${this.baseUrl}/rutas/${id}`)
      );
      return data?.data ?? null;
    } catch (e: any) {
      console.error('[MapDataService] Error al obtener ruta:', e?.error ?? e);
      return null;
    }
  }

  async createRuta(payload: { nombre: string; descripcion?: string; shape?: any; callesIds?: string[] }): Promise<RutaApiItem | null> {
    try {
      const body: any = {
        // Enviar ambas variantes por compatibilidad
        nombre: payload.nombre,
        nombre_ruta: payload.nombre,
        descripcion: payload.descripcion,
        descripcion_ruta: payload.descripcion,
        perfil_id: this.profileId,
        shape: payload.shape ? JSON.stringify(payload.shape) : undefined,
        shape_ruta: payload.shape ? JSON.stringify(payload.shape) : undefined,
        calles: payload.callesIds && payload.callesIds.length ? payload.callesIds : undefined
      };
      console.log('[MapDataService] POST /rutas =>', body);
      const resp = await firstValueFrom(
        this.http.post<{ data: RutaApiItem }>(`${this.baseUrl}/rutas`, body)
      );
      let created: RutaApiItem | null = resp?.data ?? null;
      console.log('[MapDataService] Ruta creada:', created);
      if (!created) {
        // Algunos backends no devuelven body; refrescar y buscar por nombre
        const listado = await this.loadRutas();
        created = listado.find(r => (r.nombre || r.nombre_ruta) === payload.nombre) || null;
        console.log('[MapDataService] Ruta resuelta tras recarga:', created);
      }
      return created;
    } catch (e: any) {
      console.error('[MapDataService] Error creando ruta:', e?.error ?? e);
      return null;
    }
  }

  // Recorridos
  async loadRecorridos(): Promise<RecorridoApiItem[]> {
    try {
      this.loading.set(true);
      this.error.set(null);
      const data = await firstValueFrom(
        this.http.get<{ data: RecorridoApiItem[] }>(`${this.baseUrl}/recorridos`, {
          params: { perfil_id: this.profileId }
        })
      );
      const items = data?.data ?? [];
      this.recorridos.set(items);
      return items;
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error al cargar recorridos');
      return [];
    } finally {
      this.loading.set(false);
    }
  }

  async iniciarRecorrido(rutaId: string): Promise<RecorridoApiItem | null> {
    try {
      console.log('[MapDataService] POST /recorridos', {
        url: `${this.baseUrl}/recorridos`,
        body: { ruta_id: rutaId, perfil_id: this.profileId },
        params: { perfil_id: this.profileId }
      });
      const data = await firstValueFrom(
        this.http.post<{ data: RecorridoApiItem }>(
          `${this.baseUrl}/recorridos`,
          {
            ruta_id: rutaId,
            perfil_id: this.profileId
          },
          { params: { perfil_id: this.profileId } }
        )
      );
      return data?.data ?? null;
    } catch (e: any) {
      console.warn('[MapDataService] POST /recorridos no disponible (quizá 404). Funcionalidad no soportada por la API pública.', e?.message || e);
      return null;
    }
  }

  async finalizarRecorrido(recorridoId: string): Promise<boolean> {
    try {
      console.log('[MapDataService] POST /recorridos/:id/finalizar', {
        url: `${this.baseUrl}/recorridos/${recorridoId}/finalizar`,
        params: { perfil_id: this.profileId }
      });
      await firstValueFrom(
        this.http.post(
          `${this.baseUrl}/recorridos/${recorridoId}/finalizar`,
          {},
          { params: { perfil_id: this.profileId } }
        )
      );
      return true;
    } catch (e: any) {
      console.warn('[MapDataService] POST /recorridos/:id/finalizar no disponible (quizá 404).', e?.message || e);
      return false;
    }
  }

  async listarPosiciones(recorridoId: string): Promise<PosicionApiItem[]> {
    try {
      const data = await firstValueFrom(
        this.http.get<{ data: PosicionApiItem[] }>(`${this.baseUrl}/recorridos/${recorridoId}/posiciones`, {
          params: { perfil_id: this.profileId }
        })
      );
      return data?.data ?? [];
    } catch {
      return [];
    }
  }

  async registrarPosicion(recorridoId: string, lat: number, lng: number, velocidad?: number) {
    try {
      await firstValueFrom(
        this.http.post(`${this.baseUrl}/recorridos/${recorridoId}/posiciones`, {
          lat, lng, velocidad
        })
      );
      return true;
    } catch {
      return false;
    }
  }
}
