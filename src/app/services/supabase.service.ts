import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  public supabase: SupabaseClient;

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

  // Obtener rutas
  async getRutas() {
    const { data, error } = await this.supabase
      .from('rutas')
      .select('*');
    
    return { data, error };
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
}
