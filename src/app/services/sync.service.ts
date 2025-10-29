import { Injectable } from '@angular/core';
import { ApiService, Calle } from './api.service';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class SyncService {
  constructor(
    private api: ApiService,
    private supabaseSvc: SupabaseService
  ) {}

  // Sincroniza calles desde la API externa hacia Supabase
  async syncCallesFromApi(): Promise<{ inserted: number; error: any }> {
    try {
      const calles: Calle[] = await this.api.getCalles();
      if (!Array.isArray(calles) || calles.length === 0) {
        return { inserted: 0, error: null };
      }

      // Mapear exactamente a las columnas de la tabla 'calles'
      const rows = calles.map(c => ({
        id: c.id,
        nombre: c.nombre,
        shape: c.shape
      }));

      const { data, error } = await this.supabaseSvc.upsertCalles(rows);
      return { inserted: Array.isArray(data) ? data.length : rows.length, error };
    } catch (error) {
      console.error('[SyncService] syncCallesFromApi error:', error);
      return { inserted: 0, error };
    }
  }
}
