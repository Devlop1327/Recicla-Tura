import { Injectable, signal } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  public supabase: SupabaseClient;
  public currentRole = signal<'admin' | 'conductor' | 'cliente' | null>(null);
  // Evitar múltiples llamadas concurrentes a auth.getUser() que generan NavigatorLockAcquireTimeoutError
  private getUserInFlight: Promise<User | null> | null = null;
  private cachedUser: User | null = null;
  private cachedUserAt = 0; // epoch ms
  private readonly userTtlMs = 5000; // cache 5s para reducir lock churn

  constructor() {
    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.anonKey
    );

    // Escuchar cambios en la autenticación
    this.supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, session);
    });
  }

  setCurrentRole(role: 'admin' | 'conductor' | 'cliente' | null) {
    this.currentRole.set(role);
  }

  // Autenticación
  async signInWithEmail(email: string, password: string) {
    return await this.supabase.auth.signInWithPassword({
      email,
      password
    });
  }

  async signUpWithEmail(email: string, password: string) {
    return await this.supabase.auth.signUp({
      email,
      password
    });
  }

  async signOut() {
    return await this.supabase.auth.signOut();
  }

  async getCurrentUser(): Promise<User | null> {
    // Cache de corta duración
    const now = Date.now();
    if (this.cachedUser && (now - this.cachedUserAt) < this.userTtlMs) {
      return this.cachedUser;
    }
    // Deduplicar llamadas paralelas
    if (this.getUserInFlight) {
      return this.getUserInFlight;
    }
    this.getUserInFlight = (async () => {
      try {
        const { data: { user }, error } = await this.supabase.auth.getUser();
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

  // Recuperar contraseña: envía email de restablecimiento
  async resetPasswordForEmail(email: string) {
    try {
      const { data, error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });
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

  // Actualizar perfil
  async updateProfile(userId: string, updates: any) {
    const { data, error } = await this.supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select('*');
    
    return { data, error };
  }

  // Asegurar que el perfil exista con el rol indicado usando upsert
  async ensureProfileWithRole(userId: string, role: 'admin' | 'conductor' | 'cliente') {
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
    const { data, error } = await this.supabase
      .from('rutas')
      .select('*');
    
    return { data, error };
  }

  // Eliminar ruta por id
  async deleteRuta(id: string) {
    const { data, error } = await this.supabase
      .from('rutas')
      .delete()
      .eq('id', id)
      .select('*');
    return { data, error } as any;
  }

  // Obtener calles
  async getCalles() {
    const { data, error } = await this.supabase
      .from('calles')
      .select('*');
    
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
    const { data, error } = await this.supabase
      .from('ubicaciones')
      .select('*');
    
    return { data, error };
  }

  async createUbicacion(row: { recorrido_id?: string | null; ruta_id?: string | null; lat: number; lng: number; velocidad?: number | null }) {
    try {
      // Intento estándar: columnas lat/lng/velocidad
      const { data, error } = await this.supabase
        .from('ubicaciones')
        .insert({
          recorrido_id: row.recorrido_id ?? null,
          lat: row.lat,
          lng: row.lng,
          velocidad: row.velocidad ?? null
        })
        .select('*')
        .single();
      if (!error) return { data, error } as any;
      // Fallback 1: usar latitud/longitud (esquemas alternos)
      const { data: data2, error: error2 } = await this.supabase
        .from('ubicaciones')
        .insert({
          recorrido_id: row.recorrido_id ?? null,
          latitud: row.lat,
          longitud: row.lng,
          velocidad: row.velocidad ?? null
        })
        .select('*')
        .single();
      if (!error2) return { data: data2, error: error2 } as any;
      // Fallback 2: si tu tabla usa ruta_id en lugar de recorrido_id
      const { data: data3a, error: error3a } = await this.supabase
        .from('ubicaciones')
        .insert({
          ruta_id: row.ruta_id ?? null,
          latitud: row.lat,
          longitud: row.lng,
          velocidad: row.velocidad ?? null
        })
        .select('*')
        .single();
      if (!error3a) return { data: data3a, error: error3a } as any;
      // Fallback 2: sin velocidad
      const { data: data3, error: error3 } = await this.supabase
        .from('ubicaciones')
        .insert({
          ruta_id: row.ruta_id ?? row.recorrido_id ?? null,
          latitud: row.lat,
          longitud: row.lng
        })
        .select('*')
        .single();
      return { data: data3, error: error3 } as any;
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
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'rutas' }, 
        callback
      )
      .subscribe();
  }

  subscribeToUbicaciones(callback: (payload: any) => void) {
    return this.supabase
      .channel('ubicaciones')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'ubicaciones' }, 
        callback
      )
      .subscribe();
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
          activa: r.activa ?? true
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
