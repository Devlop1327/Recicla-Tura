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
  vehiculo_id?: string;
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

  private get recorridosChannel() {
    try {
      return this.supabase.getChannel('recorridos');
    } catch {
      return null as any;
    }
  }

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
      console.log(
        '[MapDataService] /calles (API externo) ->',
        items.length,
        'items'
      );
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
            try {
              shapeStr = JSON.stringify(r.shape);
            } catch {
              shapeStr = null;
            }
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

  async createCalle(payload: {
    nombre: string;
    shape: any;
  }): Promise<CalleApiItem | null> {
    try {
      const body: any = {
        nombre: payload.nombre,
        shape: payload.shape ? JSON.stringify(payload.shape) : undefined,
      };
      console.log('[MapDataService] POST /calles =>', body);
      const resp = await firstValueFrom(
        this.http.post<{ data: CalleApiItem }>(`${this.baseUrl}/calles`, body)
      );
      const created: CalleApiItem | null = resp?.data ?? null;
      if (created) {
        // Dual write a Supabase: guardar también la calle
        try {
          const shapeStr =
            typeof created.shape === 'string'
              ? created.shape
              : payload.shape
              ? JSON.stringify(payload.shape)
              : '';
          await this.supabase.createCalle({
            nombre: created.nombre ?? payload.nombre,
            shape: shapeStr,
          });
        } catch (e) {
          console.warn('[MapDataService] Dual write Supabase calle falló:', e);
        }
        const curr = this.calles();
        this.calles.set([created, ...curr]);
        return created;
      }
      return null;
    } catch (e: any) {
      console.warn(
        '[MapDataService] POST /calles falló, intentando Supabase...',
        e?.message || e
      );
      try {
        const shapeStr = payload.shape ? JSON.stringify(payload.shape) : '';
        const { data, error } = await this.supabase.createCalle({
          nombre: payload.nombre,
          shape: shapeStr,
        });
        if (error) {
          console.error('[MapDataService] Supabase createCalle error:', error);
          return null;
        }
        const created: CalleApiItem = {
          id: (data?.id ?? data?.uuid ?? data?.pk ?? '').toString(),
          nombre: data?.nombre ?? payload.nombre,
          shape: typeof data?.shape === 'string' ? data.shape : shapeStr,
        };
        const curr = this.calles();
        this.calles.set([created, ...curr]);
        return created;
      } catch (ex) {
        console.error(
          '[MapDataService] Fallback Supabase createCalle exception:',
          ex
        );
        return null;
      }
    }
  }

  // Rutas: listar por perfil, obtener detalle
  async loadRutas(): Promise<RutaApiItem[]> {
    try {
      this.loading.set(true);
      this.error.set(null);
      // Cargar únicamente desde Supabase
      const supaRutas = await this.loadRutasFromSupabaseGeojson();
      this.rutas.set(supaRutas);
      return supaRutas;
    } catch (e: any) {
      const msg = e?.message ?? 'Error al cargar rutas';
      console.error('[MapDataService] /rutas error:', e);
      this.error.set(msg);
      return [];
    } finally {
      this.loading.set(false);
    }
  }

  private async loadRutasFromSupabaseGeojson(): Promise<RutaApiItem[]> {
    try {
      // requiere una vista en Supabase:
      // create view public.rutas_geojson as
      // select id, nombre, descripcion, ST_AsGeoJSON(linea::geometry) as shape from public.rutas where linea is not null;
      const { data, error } = await this.supabase.supabase
        .from('rutas_geojson')
        .select('id,nombre,descripcion,shape');
      if (error) {
        // View no disponible: intentar tabla 'rutas' básica y mapear si trae 'shape'
        try {
          const { data: rutasBasic, error: errBasic } =
            await this.supabase.supabase
              .from('rutas')
              .select('id,nombre,descripcion,shape');
          if (errBasic) {
            return [];
          }
          const rows = Array.isArray(rutasBasic) ? rutasBasic : [];
          return rows.map(
            (r: any) =>
              ({
                id: r.id,
                nombre: r.nombre,
                descripcion: r.descripcion,
                shape: r.shape,
              } as RutaApiItem)
          );
        } catch {
          return [];
        }
      }
      const rows = Array.isArray(data) ? data : [];
      return rows.map(
        (r: any) =>
          ({
            id: r.id,
            nombre: r.nombre,
            descripcion: r.descripcion,
            shape: r.shape,
          } as RutaApiItem)
      );
    } catch (e) {
      // Silencioso: no forzar error en consola si la vista no existe
      return [];
    }
  }

  async getRuta(id: string): Promise<RutaApiItem | null> {
    try {
      const { data, error } = await this.supabase.supabase
        .from('rutas_geojson')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) {
        console.error('[MapDataService] Error obteniendo ruta:', error);
        return null;
      }
      
      const ruta: RutaApiItem = {
        id: data.id,
        nombre: data.nombre,
        descripcion: data.descripcion,
        shape: data.shape,
      };
      
      return ruta;
    } catch (e: any) {
      console.error('[MapDataService] Error al obtener ruta:', e?.error ?? e);
      return null;
    }
  }

  async createRuta(payload: {
    nombre: string;
    descripcion?: string;
    shape?: any;
    callesIds?: string[];
  }): Promise<RutaApiItem | null> {
    try {
      const currentProfile = this.supabase.currentProfile();
      const perfilId = (currentProfile as any)?.id ?? null;
      const { data, error } = await this.supabase.createRutaGeoJson({
        nombre_ruta: payload.nombre,
        perfil_id: perfilId || '',
        shape: payload.shape ?? null,
        descripcion: payload.descripcion || null,
        activa: true,
      });

      if (error) {
        console.error('[MapDataService] Error creando ruta en Supabase (rutas):', error);
        return null;
      }

      const createdRow: any = data;
      const created: RutaApiItem = {
        id: createdRow.id,
        nombre: createdRow.nombre || createdRow.nombre_ruta || payload.nombre,
        descripcion:
          createdRow.descripcion || createdRow.descripcion_ruta || payload.descripcion || '',
        shape: createdRow.shape ?? payload.shape ?? null,
      };
      
      console.log('[MapDataService] Ruta creada en Supabase:', created);
      
      // Actualizar estado local
      const curr = this.rutas();
      this.rutas.set([created, ...curr]);
      
      return created;
    } catch (e: any) {
      console.error('[MapDataService] createRuta error:', e);
      return null;
    }
  }

  async deleteRuta(id: string): Promise<boolean> {
    try {
      const { error } = await this.supabase.deleteRuta(id);
      if (error && (error as any).code !== 'PGRST116') {
        throw error;
      }
      
      // Actualizar estado local
      const curr = this.rutas();
      this.rutas.set((curr || []).filter((r) => r.id !== id));
      
      console.log('[MapDataService] Ruta eliminada exitosamente:', id);
      return true;
    } catch (e) {
      console.error('[MapDataService] deleteRuta error:', e);
      return false;
    }
  }

  async updateRuta(
    id: string,
    updates: { nombre?: string; descripcion?: string; shape?: any }
  ): Promise<RutaApiItem | null> {
    try {
      const updateData: any = {};
      if (updates.nombre !== undefined) updateData.nombre = updates.nombre;
      if (updates.descripcion !== undefined)
        updateData.descripcion = updates.descripcion;
      if (updates.shape !== undefined)
        updateData.shape = updates.shape ? JSON.stringify(updates.shape) : null;

      const { data, error } = await this.supabase.supabase
        .from('rutas')
        .update(updateData)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('[MapDataService] Error actualizando ruta en Supabase (rutas):', error);
        return null;
      }

      const row: any = data;
      const updated: RutaApiItem = {
        id: row.id,
        nombre: row.nombre || row.nombre_ruta,
        descripcion: row.descripcion || row.descripcion_ruta,
        shape: row.shape,
      };
      
      console.log('[MapDataService] Ruta actualizada en Supabase:', updated);
      
      // Actualizar estado local
      const list = this.rutas();
      const next = (list || []).map((r) =>
        r.id === id ? updated : r
      );
      this.rutas.set(next);
      
      return updated;
    } catch (e: any) {
      console.error('[MapDataService] updateRuta error:', e);
      return null;
    }
  }

  // Recorridos
  async loadRecorridos(): Promise<RecorridoApiItem[]> {
    try {
      this.loading.set(true);
      this.error.set(null);
      const { data, error } = await this.supabase.listRecorridos();
      if (error) {
        this.error.set((error as any)?.message ?? 'Error al cargar recorridos');
        this.recorridos.set([]);
        return [];
      }
      const items = (Array.isArray(data) ? data : []) as RecorridoApiItem[];
      this.recorridos.set(items);
      return items;
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error al cargar recorridos');
      this.recorridos.set([]);
      return [];
    } finally {
      this.loading.set(false);
    }
  }

  async iniciarRecorrido(
    rutaId: string,
    vehiculoId?: string
  ): Promise<RecorridoApiItem | null> {
    try {
      const currentProfile = this.supabase.currentProfile();
      const perfilId = (currentProfile as any)?.id ?? null;
      const { data, error } = await this.supabase.createRecorrido({
        ruta_id: rutaId,
        vehiculo_id: vehiculoId ?? null,
        perfil_id: perfilId,
        estado: 'en_progreso',
      });
      if (error) {
        console.warn('[MapDataService] createRecorrido Supabase error', error);
        return null;
      }
      const rec = data as RecorridoApiItem;
      // Emitir señal realtime para que clientes refresquen
      try {
        const ch = this.recorridosChannel;
        await ch?.send({
          type: 'broadcast',
          event: 'recorrido',
          payload: { action: 'start', recorridoId: rec.id },
        });
      } catch {}
      return rec;
    } catch (e: any) {
      console.warn('[MapDataService] createRecorrido Supabase exception', e);
      return null;
    }
  }

  async finalizarRecorrido(recorridoId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase.updateRecorrido(recorridoId, {
        estado: 'finalizado',
        finalizado_en: new Date().toISOString(),
      });
      if (error) {
        console.warn('[MapDataService] updateRecorrido Supabase error', error);
        return false;
      }
      // Emitir señal realtime para que clientes refresquen
      try {
        const ch = this.recorridosChannel;
        await ch?.send({
          type: 'broadcast',
          event: 'recorrido',
          payload: { action: 'finish', recorridoId },
        });
      } catch {}
      return true;
    } catch (e: any) {
      console.warn('[MapDataService] finalizarRecorrido Supabase exception', e);
      return false;
    }
  }

  async listarPosiciones(recorridoId: string): Promise<PosicionApiItem[]> {
    // Evitar errores cuando usamos un recorrido local (fallback de UI)
    if (recorridoId && recorridoId.startsWith('local-')) {
      return [];
    }
    try {
      const data = await firstValueFrom(
        this.http.get<{ data: any[] }>(
          `${this.baseUrl}/recorridos/${recorridoId}/posiciones`,
          {
            params: { perfil_id: this.profileId } as any,
          }
        )
      );
      const arr = Array.isArray(data?.data) ? data!.data : [];
      return arr.map(
        (p: any) =>
          ({
            id: p.id,
            recorrido_id: p.recorrido_id,
            lat: p.lat,
            lng: p.lng ?? p.lon,
            velocidad: p.velocidad,
            timestamp: p.timestamp || p.created_at || new Date().toISOString(),
          } as PosicionApiItem)
      );
    } catch {
      try {
        const { data, error } = await this.supabase.supabase
          .from('ubicaciones')
          .select('*')
          .eq('recorrido_id', recorridoId)
          .order('created_at', { ascending: true });
        if (error) return [];
        const rows = Array.isArray(data) ? data : [];
        return rows
          .map(
            (r: any) =>
              ({
                id: r.id,
                recorrido_id: r.recorrido_id ?? recorridoId,
                lat: (r.lat ?? r.latitud) as number,
                lng: (r.lng ?? r.longitud) as number,
                velocidad: r.velocidad ?? null,
                timestamp:
                  r.created_at || r.updated_at || new Date().toISOString(),
              } as PosicionApiItem)
          )
          .filter(
            (p) => typeof p.lat === 'number' && typeof p.lng === 'number'
          );
      } catch {
        return [];
      }
    }
  }

  async registrarPosicion(
    recorridoId: string,
    lat: number,
    lng: number,
    velocidad?: number
  ) {
    // La persistencia de posiciones ahora se hace solo en Supabase (tabla 'ubicaciones').
    // Este método se mantiene como no-op para no romper llamadas existentes.
    return true;
  }
}
