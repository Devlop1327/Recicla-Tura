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
        // Dual write a Supabase: guardar también la calle
        try {
          const shapeStr = typeof created.shape === 'string' ? created.shape : (payload.shape ? JSON.stringify(payload.shape) : '');
          await this.supabase.createCalle({ nombre: created.nombre ?? payload.nombre, shape: shapeStr });
        } catch (e) {
          console.warn('[MapDataService] Dual write Supabase calle falló:', e);
        }
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
      // 0) Preferir Supabase primero para evitar CORS
      const supaFirst = await this.loadRutasFromSupabaseGeojson();
      if (supaFirst.length > 0) {
        this.rutas.set(supaFirst);
        return supaFirst;
      }
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
      // Si no hay rutas o vienen sin shape, intentar fallback Supabase view 'rutas_geojson'
      const hasAnyShape = (items || []).some(r => !!(r as any)?.shape);
      if (!hasAnyShape) {
        const supa = await this.loadRutasFromSupabaseGeojson();
        if (supa.length > 0) {
          this.rutas.set(supa);
          return supa;
        }
      }
      return items;
    } catch (e: any) {
      console.warn('[MapDataService] /rutas con perfil_id falló, intentando sin parámetro...', { status: e?.status, message: e?.message || e });
      try {
        const data2 = await firstValueFrom(
          this.http.get<{ data: RutaApiItem[] }>(`${this.baseUrl}/rutas`)
        );
        const items2 = data2?.data ?? [];
        console.log('[MapDataService] /rutas (sin perfil_id) ->', items2.length, 'items');
        // Fallback a Supabase si no hay shape
        const hasAnyShape2 = (items2 || []).some(r => !!(r as any)?.shape);
        if (!hasAnyShape2) {
          const supa = await this.loadRutasFromSupabaseGeojson();
          if (supa.length > 0) {
            this.rutas.set(supa);
            return supa;
          }
        }
        this.rutas.set(items2);
        return items2;
      } catch (e2: any) {
        const msg = e2?.message ?? 'Error al cargar rutas';
        console.error('[MapDataService] /rutas error final:', e2);
        this.error.set(msg);
        const supa = await this.loadRutasFromSupabaseGeojson();
        if (supa.length > 0) {
          this.rutas.set(supa);
          return supa;
        }
        return [];
      }
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
          const { data: rutasBasic, error: errBasic } = await this.supabase.supabase
            .from('rutas')
            .select('id,nombre,descripcion,shape');
          if (errBasic) {
            return [];
          }
          const rows = Array.isArray(rutasBasic) ? rutasBasic : [];
          return rows.map((r: any) => ({ id: r.id, nombre: r.nombre, descripcion: r.descripcion, shape: r.shape } as RutaApiItem));
        } catch {
          return [];
        }
      }
      const rows = Array.isArray(data) ? data : [];
      return rows.map((r: any) => ({ id: r.id, nombre: r.nombre, descripcion: r.descripcion, shape: r.shape } as RutaApiItem));
    } catch (e) {
      // Silencioso: no forzar error en consola si la vista no existe
      return [];
    }
  }

  async getRuta(id: string): Promise<RutaApiItem | null> {
    try {
      const data = await firstValueFrom(
        this.http.get<{ data: RutaApiItem }>(`${this.baseUrl}/rutas/${id}`)
      );
      const rec = data?.data ?? null;
      // Emitir señal realtime para que clientes refresquen
      try {
        const ch = this.recorridosChannel;
        await ch?.send({ type: 'broadcast', event: 'recorrido', payload: { action: 'start', recorrido: rec } });
      } catch {}
      return rec;
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
      // Dual write a Supabase (RPC) si tenemos datos suficientes
      try {
        const gid = (created?.id ?? '').toString();
        const gname = created?.nombre || created?.nombre_ruta || payload.nombre;
        const gdesc = created?.descripcion || created?.descripcion_ruta || payload.descripcion || '';
        let gshape: any = null;
        if (created?.shape) {
          try { gshape = typeof created.shape === 'string' ? JSON.parse(created.shape) : created.shape; } catch { gshape = null; }
        }
        if (!gshape && payload.shape) {
          gshape = payload.shape;
        }
        if (gid && gname && gshape) {
          await this.persistRutaToSupabase(gid, gname, gdesc, gshape);
        }
      } catch (rpcErr) {
        console.warn('[MapDataService] RPC upsert_ruta_geojson falló tras crear ruta:', rpcErr);
      }
      return created;
    } catch (e: any) {
      console.error('[MapDataService] Error creando ruta:', e?.error ?? e);
      return null;
    }
  }

  async deleteRuta(id: string): Promise<boolean> {
    try {
      // Intento API externa
      try {
        await firstValueFrom(
          this.http.delete(`${this.baseUrl}/rutas/${id}`, { params: { perfil_id: this.profileId } })
        );
      } catch (e) {
        // Fallback Supabase
        const { error } = await this.supabase.deleteRuta(id);
        if (error) throw error;
      }
      // Estado local
      const curr = this.rutas();
      this.rutas.set((curr || []).filter(r => r.id !== id));
      return true;
    } catch (e) {
      console.error('[MapDataService] deleteRuta error:', e);
      return false;
    }
  }

  async updateRuta(id: string, updates: { nombre?: string; descripcion?: string; shape?: any }): Promise<RutaApiItem | null> {
    try {
      let updated: RutaApiItem | null = null;
      const body: any = {
        nombre: updates.nombre,
        nombre_ruta: updates.nombre,
        descripcion: updates.descripcion,
        descripcion_ruta: updates.descripcion,
        shape: updates.shape ? JSON.stringify(updates.shape) : undefined,
        shape_ruta: updates.shape ? JSON.stringify(updates.shape) : undefined,
        perfil_id: this.profileId
      };
      try {
        const resp = await firstValueFrom(
          this.http.put<{ data: RutaApiItem }>(`${this.baseUrl}/rutas/${id}`, body)
        );
        updated = resp?.data ?? null;
      } catch (e) {
        const { data, error } = await this.supabase.supabase
          .from('rutas')
          .update({ nombre: updates.nombre, descripcion: updates.descripcion, shape: updates.shape ? JSON.stringify(updates.shape) : undefined })
          .eq('id', id)
          .select('*')
          .single();
        if (error) throw error;
        updated = data as any;
      }
      const list = this.rutas();
      const next = (list || []).map(r => (r.id === id ? { ...r, ...updated } as any : r));
      this.rutas.set(next);
      // Dual write a Supabase (RPC)
      try {
        const gname = updated?.nombre || updated?.nombre_ruta || updates.nombre || '';
        const gdesc = updated?.descripcion || updated?.descripcion_ruta || updates.descripcion || '';
        let gshape: any = null;
        const candShape = updated?.shape ?? updates.shape;
        if (candShape) {
          try { gshape = typeof candShape === 'string' ? JSON.parse(candShape) : candShape; } catch { gshape = null; }
        }
        if (id && gname && gshape) {
          await this.persistRutaToSupabase(id, gname, gdesc, gshape);
        }
      } catch (rpcErr) {
        console.warn('[MapDataService] RPC upsert_ruta_geojson falló tras actualizar ruta:', rpcErr);
      }
      return updated;
    } catch (e) {
      console.error('[MapDataService] updateRuta error:', e);
      return null;
    }
  }

  private async persistRutaToSupabase(id: string, nombre: string, descripcion: string, shape: any) {
    try {
      const payload = {
        p_id: id,
        p_nombre: nombre,
        p_descripcion: descripcion,
        p_color: '#FF9800',
        p_activa: true,
        p_geojson: typeof shape === 'string' ? JSON.parse(shape) : shape
      };
      const { error } = await this.supabase.supabase.rpc('upsert_ruta_geojson', payload as any);
      if (error) throw error;
    } catch (e) {
      console.warn('[MapDataService] persistRutaToSupabase error:', e);
    }
  }

  // Recorridos
  async loadRecorridos(): Promise<RecorridoApiItem[]> {
    try {
      this.loading.set(true);
      this.error.set(null);
      const data = await firstValueFrom(
        this.http.get<{ data?: RecorridoApiItem[] } | RecorridoApiItem[]>(`${this.baseUrl}/misrecorridos`, {
          params: { perfil_id: this.profileId }
        })
      );
      const items = Array.isArray(data) ? (data as RecorridoApiItem[]) : (data?.data ?? []);
      this.recorridos.set(items);
      return items;
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error al cargar recorridos');
      return [];
    } finally {
      this.loading.set(false);
    }
  }

  async iniciarRecorrido(rutaId: string, vehiculoId?: string): Promise<RecorridoApiItem | null> {
    try {
      console.log('[MapDataService] POST /recorridos/iniciar', {
        url: `${this.baseUrl}/recorridos/iniciar`,
        body: { ruta_id: rutaId, vehiculo_id: vehiculoId, perfil_id: this.profileId }
      });
      const data = await firstValueFrom(
        this.http.post<{ data: RecorridoApiItem }>(
          `${this.baseUrl}/recorridos/iniciar`,
          {
            ruta_id: rutaId,
            vehiculo_id: vehiculoId,
            perfil_id: this.profileId
          }
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
      console.log('[MapDataService] POST /recorridos/{id}/finalizar', {
        url: `${this.baseUrl}/recorridos/${recorridoId}/finalizar`,
        body: { perfil_id: this.profileId }
      });
      await firstValueFrom(
        this.http.post(
          `${this.baseUrl}/recorridos/${recorridoId}/finalizar`,
          { perfil_id: this.profileId },
          { params: { perfil_id: this.profileId } as any }
        )
      );
      // Emitir señal realtime para que clientes refresquen
      try {
        const ch = this.recorridosChannel;
        await ch?.send({ type: 'broadcast', event: 'recorrido', payload: { action: 'finish', recorridoId } });
      } catch {}
      return true;
    } catch (e: any) {
      console.warn('[MapDataService] finalizarRecorrido con perfil_id falló, reintentando sin body...', e?.message || e);
      try {
        await firstValueFrom(
          this.http.post(
            `${this.baseUrl}/recorridos/${recorridoId}/finalizar`,
            {},
            { params: { perfil_id: this.profileId } as any }
          )
        );
        return true;
      } catch (e2: any) {
        console.warn('[MapDataService] POST /recorridos/{id}/finalizar falló definitivamente:', e2?.message || e2);
        return false;
      }
    }
  }

  async listarPosiciones(recorridoId: string): Promise<PosicionApiItem[]> {
    // Evitar errores cuando usamos un recorrido local (fallback de UI)
    if (recorridoId && recorridoId.startsWith('local-')) {
      return [];
    }
    try {
      const data = await firstValueFrom(
        this.http.get<{ data: any[] }>(`${this.baseUrl}/recorridos/${recorridoId}/posiciones`, {
          params: { perfil_id: this.profileId } as any
        })
      );
      const arr = Array.isArray(data?.data) ? data!.data : [];
      // Mapear lon->lng si la API usa 'lon'
      return arr.map((p: any) => ({
        id: p.id,
        recorrido_id: p.recorrido_id,
        lat: p.lat,
        lng: p.lng ?? p.lon,
        velocidad: p.velocidad,
        timestamp: p.timestamp || p.created_at || new Date().toISOString()
      } as PosicionApiItem));
    } catch {
      // Fallback: leer desde Supabase
      try {
        const { data, error } = await this.supabase.supabase
          .from('ubicaciones')
          .select('*')
          .eq('recorrido_id', recorridoId)
          .order('created_at', { ascending: true });
        if (error) return [];
        const rows = Array.isArray(data) ? data : [];
        return rows.map((r: any) => ({
          id: r.id,
          recorrido_id: r.recorrido_id ?? recorridoId,
          lat: (r.lat ?? r.latitud) as number,
          lng: (r.lng ?? r.longitud) as number,
          velocidad: r.velocidad ?? null,
          timestamp: r.created_at || r.updated_at || new Date().toISOString()
        } as PosicionApiItem)).filter(p => typeof p.lat === 'number' && typeof p.lng === 'number');
      } catch {
        return [];
      }
    }
  }

  async registrarPosicion(recorridoId: string, lat: number, lng: number, velocidad?: number) {
    try {
      await firstValueFrom(
        this.http.post(`${this.baseUrl}/recorridos/${recorridoId}/posiciones`, {
          lat,
          lon: lng,
          perfil_id: this.profileId,
          velocidad
        })
      );
      return true;
    } catch {
      return false;
    }
  }
}
