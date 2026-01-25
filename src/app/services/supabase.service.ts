import { Injectable, signal } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  public supabase: SupabaseClient;
  public currentRole = signal<'admin' | 'conductor' | 'cliente' | null>(null);
  public currentUser = signal<User | null>(null);
  public currentProfile = signal<any | null>(null);
  // Evitar múltiples llamadas concurrentes a auth.getUser() que generan NavigatorLockAcquireTimeoutError
  private getUserInFlight: Promise<User | null> | null = null;
  private cachedUser: User | null = null;
  private cachedUserAt = 0; // epoch ms
  private readonly userTtlMs = 30000; // cache 5s para reducir lock churn

  constructor() {
    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.anonKey
    );

    // Escuchar cambios en la autenticación
    this.supabase.auth.onAuthStateChange((event, session) => {
      try {
        const u = session?.user ?? null;
        this.cachedUser = u;
        this.cachedUserAt = Date.now();
        this.currentUser.set(u);
      } catch {}
      this.loadCurrentUserAndProfile();
    });

    this.loadCurrentUserAndProfile();
  }

  // Horarios de rutas (admin)
  // Tabla sugerida en Supabase: ruta_horarios(id, ruta_id, dias_semana text[], hora_inicio time, hora_fin time, activo bool)

  async listHorariosRuta() {
    const { data, error } = await this.supabase
      .from('ruta_horarios')
      .select('*')
      .order('hora_inicio', { ascending: true });
    return { data: (data || []) as any[], error } as any;
  }

  async createHorarioRuta(payload: {
    ruta_id: string;
    dias_semana: string[];
    hora_inicio: string;
    hora_fin?: string | null;
    activo?: boolean;
  }) {
    const row: any = {
      ruta_id: payload.ruta_id,
      dias_semana: payload.dias_semana,
      hora_inicio: payload.hora_inicio,
      hora_fin: payload.hora_fin ?? null,
      activo: payload.activo ?? true,
    };
    const { data, error } = await this.supabase
      .from('ruta_horarios')
      .insert(row)
      .select('*')
      .single();
    return { data, error } as any;
  }

  async updateHorarioRuta(
    id: string,
    updates: {
      ruta_id?: string;
      dias_semana?: string[];
      hora_inicio?: string;
      hora_fin?: string | null;
      activo?: boolean;
    }
  ) {
    const { data, error } = await this.supabase
      .from('ruta_horarios')
      .update(updates as any)
      .eq('id', id)
      .select('*')
      .single();
    return { data, error } as any;
  }

  async deleteHorarioRuta(id: string) {
    const { error } = await this.supabase
      .from('ruta_horarios')
      .delete()
      .eq('id', id);
    return { data: null, error } as any;
  }

  // Recorridos (solo Supabase)
  // Tabla: recorridos(id, ruta_id, perfil_id, vehiculo_id?, estado, iniciado_en, finalizado_en)

  async listRecorridos() {
    const { data, error } = await this.supabase
      .from('recorridos')
      .select('*')
      .order('iniciado_en', { ascending: false });
    return { data: (data || []) as any[], error } as any;
  }

  async createRecorrido(payload: {
    ruta_id: string;
    perfil_id?: string | null;
    vehiculo_id?: string | null;
    estado?: string | null;
  }) {
    const row: any = {
      ruta_id: payload.ruta_id,
      perfil_id: payload.perfil_id ?? null,
      vehiculo_id: payload.vehiculo_id ?? null,
    };
    if (payload.estado != null) row.estado = payload.estado;
    const { data, error } = await this.supabase
      .from('recorridos')
      .insert(row)
      .select('*')
      .single();
    return { data, error } as any;
  }

  async updateRecorrido(
    id: string,
    updates: {
      ruta_id?: string;
      perfil_id?: string | null;
      vehiculo_id?: string | null;
      estado?: string | null;
      iniciado_en?: string | null;
      finalizado_en?: string | null;
    }
  ) {
    const { data, error } = await this.supabase
      .from('recorridos')
      .update(updates as any)
      .eq('id', id)
      .select('*')
      .single();
    return { data, error } as any;
  }

  setCurrentRole(role: 'admin' | 'conductor' | 'cliente' | null) {
    this.currentRole.set(role);
  }

  // Autenticación
  async signInWithEmail(email: string, password: string) {
    return await this.supabase.auth.signInWithPassword({
      email,
      password,
    });
  }

  async signUpWithEmail(email: string, password: string) {
    return await this.supabase.auth.signUp({
      email,
      password,
    });
  }

  async signOut() {
    return await this.supabase.auth.signOut();
  }

  async getCurrentUser(): Promise<User | null> {
    // Cache de corta duración
    const now = Date.now();
    if (this.cachedUser && now - this.cachedUserAt < this.userTtlMs) {
      return this.cachedUser;
    }
    if (this.getUserInFlight) {
      return this.getUserInFlight;
    }
    this.getUserInFlight = (async () => {
      try {
        const {
          data: { user },
          error,
        } = await this.supabase.auth.getUser();
        if (error) {
          console.warn('getCurrentUser error:', error);
        }
        this.cachedUser = user ?? null;
        this.cachedUserAt = Date.now();
        return this.cachedUser;
      } catch (e) {
        console.error('Error en getCurrentUser:', e);
        this.cachedUser = null;
        return null;
      } finally {
        // Liberar el in-flight después de resolver
        this.getUserInFlight = null;
      }
    })();
    return this.getUserInFlight;
  }

  async loadCurrentUserAndProfile(): Promise<void> {
    try {
      const user = await this.getCurrentUser();
      this.currentUser.set(user);
      if (user?.id) {
        const { data } = await this.getProfile(user.id);
        this.currentProfile.set(data ?? null);
        const role = (data as any)?.role ?? null;
        this.setCurrentRole(role as any);
      } else {
        this.currentProfile.set(null);
        this.setCurrentRole(null);
      }
    } catch {
      this.currentProfile.set(null);
    }
  }

  // Recuperar contraseña: envía email de restablecimiento
  async resetPasswordForEmail(email: string) {
    try {
      const { data, error } = await this.supabase.auth.resetPasswordForEmail(
        email,
        {
          redirectTo: `${window.location.origin}/reset-password`,
        }
      );
      return { data, error };
    } catch (error) {
      console.error('Error resetPasswordForEmail:', error);
      return { data: null, error } as any;
    }
  }

  // Obtener perfil del usuario
  async getProfile(userId: string) {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    return { data, error };
  }

  // Listar perfiles con búsqueda y paginación
  async listProfiles(
    params: {
      q?: string;
      limit?: number;
      offset?: number;
      orderBy?: string;
      ascending?: boolean;
    } = {}
  ) {
    const {
      q,
      limit = 20,
      offset = 0,
      orderBy = 'created_at',
      ascending = false,
    } = params;
    let query = this.supabase
      .from('profiles')
      .select('*', { count: 'exact' })
      .order(orderBy as any, { ascending });

    if (q && q.trim()) {
      // Buscar por email, full_name o phone si existen en el esquema
      const term = `%${q.trim()}%`;
      query = query.or(
        [
          'email.ilike.' + term,
          'full_name.ilike.' + term,
          'phone.ilike.' + term,
        ].join(',')
      );
    }

    const { data, error, count } = await query.range(
      offset,
      offset + limit - 1
    );
    return { data: data || [], error, count: count ?? 0 } as any;
  }

  // Actualizar perfil
  async updateProfile(userId: string, updates: any) {
    const { data, error } = await this.supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select('*');

    return { data, error };
  }

  // Actualizar solo el rol del perfil
  async updateProfileRole(
    userId: string,
    role: 'admin' | 'conductor' | 'cliente'
  ) {
    const { data, error } = await this.supabase
      .from('profiles')
      .update({ role })
      .eq('id', userId)
      .select('*')
      .single();
    return { data, error } as any;
  }

  // Upsert genérico de perfil (por id)
  async upsertProfile(row: any) {
    const { data, error } = await this.supabase
      .from('profiles')
      .upsert(row, { onConflict: 'id' })
      .select('*')
      .single();
    return { data, error } as any;
  }

  // Eliminar perfil (no elimina auth.users)
  async deleteProfile(userId: string) {
    const { data, error } = await this.supabase
      .from('profiles')
      .delete()
      .eq('id', userId)
      .select('*')
      .single();
    return { data, error } as any;
  }

  // Enviar magic link para invitar/crear cuenta sin Edge Function
  async sendMagicLink(email: string) {
    try {
      const { data, error } = await this.supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });
      return { data, error } as any;
    } catch (error) {
      return { data: null, error } as any;
    }
  }

  // Asegurar que el perfil exista con el rol indicado usando upsert
  async ensureProfileWithRole(
    userId: string,
    role: 'admin' | 'conductor' | 'cliente'
  ) {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .upsert({ id: userId, role }, { onConflict: 'id' })
        .select('*')
        .single();
      return { data, error } as any;
    } catch (error) {
      return { data: null, error } as any;
    }
  }

  // Obtener rutas
  async getRutas() {
    const { data, error } = await this.supabase.from('rutas').select('*');

    return { data, error };
  }

  // Obtener una ruta específica por id
  async getRuta(id: string) {
    const { data, error } = await this.supabase
      .from('rutas')
      .select('*')
      .eq('id', id)
      .single();

    return { data, error };
  }

  // Crear ruta con GeoJSON (admin)
  async createRutaGeoJson(payload: {
    nombre_ruta: string;
    perfil_id: string;
    shape: any;
    descripcion?: string | null;
    activa?: boolean;
  }) {
    try {
      const row: any = {
        nombre: payload.nombre_ruta,
        perfil_id: payload.perfil_id,
        // almacenar GeoJSON como string si la columna es de tipo text; si es jsonb también funciona enviando el objeto
        shape:
          typeof payload.shape === 'string'
            ? payload.shape
            : JSON.stringify(payload.shape),
      };
      if (payload.descripcion !== undefined)
        row.descripcion = payload.descripcion;
      if (payload.activa !== undefined) row.activa = payload.activa;

      const { data, error } = await this.supabase
        .from('rutas')
        .insert(row)
        .select('*')
        .single();
      return { data, error } as any;
    } catch (error) {
      return { data: null, error } as any;
    }
  }

  // Obtener vehículos
  async getVehiculos() {
    try {
      const { data, error } = await this.supabase.from('vehiculos').select('*');
      return { data: data || [], error } as any;
    } catch (error) {
      return { data: [], error } as any;
    }
  }

  // Crear vehículo (CRUD directo en Supabase)
  async createVehiculo(payload: {
    placa: string;
    modelo?: string | null;
    marca?: string | null;
    activo?: boolean;
    perfil_id?: string;
  }) {
    try {
      const currentProfile = this.currentProfile();
      const perfilId =
        payload.perfil_id ?? (currentProfile?.id as string | undefined);

      const row: any = {
        placa: payload.placa,
        modelo: payload.modelo ?? null,
        marca: payload.marca ?? null,
        activo: payload.activo ?? true,
      };

      if (perfilId) {
        row.perfil_id = perfilId;
      }

      const { data, error } = await this.supabase
        .from('vehiculos')
        .insert(row)
        .select('*')
        .single();

      return { data, error } as any;
    } catch (error) {
      return { data: null, error } as any;
    }
  }

  // Actualizar vehículo
  async updateVehiculo(
    id: string,
    payload: {
      placa?: string;
      modelo?: string | null;
      marca?: string | null;
      activo?: boolean;
    }
  ) {
    try {
      const updates: any = {};
      if (payload.placa !== undefined) updates.placa = payload.placa;
      if (payload.modelo !== undefined) updates.modelo = payload.modelo;
      if (payload.marca !== undefined) updates.marca = payload.marca;
      if (payload.activo !== undefined) updates.activo = payload.activo;

      const { data, error } = await this.supabase
        .from('vehiculos')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();

      return { data, error } as any;
    } catch (error) {
      return { data: null, error } as any;
    }
  }

  // Eliminar vehículo
  async deleteVehiculo(id: string) {
    try {
      const { data, error } = await this.supabase
        .from('vehiculos')
        .delete()
        .eq('id', id)
        .select('*')
        .single();

      return { data, error } as any;
    } catch (error) {
      return { data: null, error } as any;
    }
  }

  // Eliminar ruta por id
  async deleteRuta(id: string) {
    const { error } = await this.supabase.from('rutas').delete().eq('id', id);
    // Supabase no devuelve cuerpo en DELETE por defecto; solo nos interesa si hay error
    return { data: null, error } as any;
  }

  // Obtener puntos de una ruta desde Supabase
  async getPuntosRuta(rutaId: string) {
    const { data, error } = await this.supabase
      .from('puntos_ruta')
      .select('*')
      .eq('ruta_id', rutaId)
      .order('orden', { ascending: true });

    return { data, error };
  }

  // Obtener calles
  async getCalles() {
    const { data, error } = await this.supabase.from('calles').select('*');

    return { data, error };
  }

  // Crear una calle
  async createCalle(calle: { nombre: string; shape: string }) {
    const { data, error } = await this.supabase
      .from('calles')
      .insert(calle)
      .select('*')
      .single();
    return { data, error } as any;
  }

  // Obtener ubicaciones
  async getUbicaciones() {
    const { data, error } = await this.supabase.from('ubicaciones').select('*');

    return { data, error };
  }

  async createUbicacion(row: {
    recorrido_id?: string | null;
    ruta_id?: string | null;
    lat: number;
    lng: number;
    velocidad?: number | null;
  }) {
    try {
      // Ajustado al esquema actual: latitud/longitud, sin columna 'velocidad'
      const payload: any = {
        latitud: row.lat,
        longitud: row.lng,
      };
      if (row.recorrido_id) payload.recorrido_id = row.recorrido_id;
      if (row.ruta_id) payload.ruta_id = row.ruta_id;

      const { data, error } = await this.supabase
        .from('ubicaciones')
        .insert(payload)
        .select('*')
        .single();
      return { data, error } as any;
    } catch (error) {
      return { data: null, error } as any;
    }
  }

  // Obtener notificaciones
  async getNotificaciones(userId: string) {
    const { data, error } = await this.supabase
      .from('notificaciones')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    return { data, error };
  }

  // Crear notificación
  async createNotificacion(notificacion: any) {
    const { data, error } = await this.supabase
      .from('notificaciones')
      .insert(notificacion);

    return { data, error };
  }

  // Actualizar notificación
  async updateNotificacion(id: string, updates: any) {
    const { data, error } = await this.supabase
      .from('notificaciones')
      .update(updates)
      .eq('id', id);

    return { data, error };
  }

  // Suscribirse a cambios en tiempo real
  subscribeToRutas(callback: (payload: any) => void) {
    return this.supabase
      .channel('rutas')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rutas' },
        callback
      )
      .subscribe();
  }

  subscribeToUbicaciones(callback: (payload: any) => void) {
    return this.supabase
      .channel('ubicaciones')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ubicaciones' },
        callback
      )
      .subscribe();
  }

  // Realtime helpers (broadcast)
  getChannel(name: string) {
    return this.supabase.channel(name);
  }

  async broadcastPosition(
    channel: any,
    payload: {
      recorrido_id?: string;
      ruta_id?: string | null;
      lat: number;
      lng: number;
    }
  ) {
    try {
      await channel.send({ type: 'broadcast', event: 'pos', payload });
    } catch (e) {
      // no-op
    }
  }

  // Upload file to bucket (avatars)
  async uploadAvatar(filePath: string, file: File) {
    // filePath example: `avatars/${userId}/${filename}`
    try {
      const { data, error } = await this.supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      return { data, error };
    } catch (error) {
      console.error('Error uploading avatar:', error);
      return { data: null, error };
    }
  }

  // Get public URL for a file in avatars bucket
  getPublicUrl(path: string) {
    try {
      const { data } = this.supabase.storage.from('avatars').getPublicUrl(path);
      return data.publicUrl;
    } catch (error) {
      console.error('Error getting public url:', error);
      return null;
    }
  }

  // Upsert masivo de rutas en la tabla 'rutas'
  async upsertRutas(rows: any[]) {
    try {
      if (!Array.isArray(rows) || rows.length === 0) {
        return { data: [], error: null } as any;
      }
      // Particionar en chunks para evitar payloads grandes
      const chunkSize = 500;
      const chunks: any[][] = [];
      for (let i = 0; i < rows.length; i += chunkSize) {
        chunks.push(rows.slice(i, i + chunkSize));
      }

      const results: any[] = [];
      for (const chunk of chunks) {
        // Filtrar solo columnas existentes para evitar errores como
        // "Could not find the 'shape' column of 'rutas' in the schema cache"
        const sanitized = chunk.map((r) => ({
          id: r.id,
          nombre: r.nombre ?? r.nombre_ruta ?? null,
          descripcion: r.descripcion ?? r.descripcion_ruta ?? null,
          activa: r.activa ?? true,
        }));
        const { data, error } = await this.supabase
          .from('rutas')
          .upsert(sanitized, { onConflict: 'id' });
        if (error) {
          console.error('upsertRutas chunk error:', error);
          return { data: results, error };
        }
        const arr = Array.isArray(data) ? (data as any[]) : [];
        results.push(...arr);
      }

      return { data: results, error: null } as any;
    } catch (error) {
      console.error('upsertRutas exception:', error);
      return { data: null, error } as any;
    }
  }

  // Upsert masivo de calles en la tabla 'calles'
  async upsertCalles(rows: any[]) {
    try {
      if (!Array.isArray(rows) || rows.length === 0) {
        return { data: [], error: null } as any;
      }
      const chunkSize = 500;
      const chunks: any[][] = [];
      for (let i = 0; i < rows.length; i += chunkSize) {
        chunks.push(rows.slice(i, i + chunkSize));
      }

      const results: any[] = [];
      for (const chunk of chunks) {
        const { data, error } = await this.supabase
          .from('calles')
          .upsert(chunk, { onConflict: 'id' });
        if (error) {
          console.error('upsertCalles chunk error:', error);
          return { data: results, error };
        }
        const arr = Array.isArray(data) ? (data as any[]) : [];
        results.push(...arr);
      }

      return { data: results, error: null } as any;
    } catch (error) {
      console.error('upsertCalles exception:', error);
      return { data: null, error } as any;
    }
  }
}
