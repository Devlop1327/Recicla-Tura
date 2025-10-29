import { Injectable, signal } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  public supabase: SupabaseClient;
  public currentRole = signal<'admin' | 'conductor' | 'cliente' | null>(null);

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
    try {
      const { data: { user }, error } = await this.supabase.auth.getUser();
      console.log('getCurrentUser - Usuario:', user, 'Error:', error);
      return user;
    } catch (error) {
      console.error('Error en getCurrentUser:', error);
      return null;
    }
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
      .eq('id', userId);
    
    return { data, error };
  }

  // Asegurar que el perfil exista con el rol indicado (update -> insert fallback)
  async ensureProfileWithRole(userId: string, role: 'admin' | 'conductor' | 'cliente') {
    try {
      const upd = await this.updateProfile(userId, { role });
      if (!upd.error) return upd;
    } catch {}
    // Insert fallback
    const { data, error } = await this.supabase
      .from('profiles')
      .insert({ id: userId, role })
      .select('*')
      .single();
    return { data, error } as any;
  }

  // Obtener rutas
  async getRutas() {
    const { data, error } = await this.supabase
      .from('rutas')
      .select('*');
    
    return { data, error };
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
        const { data, error } = await this.supabase
          .from('rutas')
          // Requiere índice único en 'id' (pk) o la columna que corresponda
          .upsert(chunk, { onConflict: 'id' });
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
