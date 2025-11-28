import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { signal } from '@angular/core';
import { SupabaseService } from '../../../services/supabase.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './admin-settings.page.html'
})
export class AdminSettingsPage {
  supportsRecorridos = signal<boolean>(this.readBool('rt_supportsRec', environment.api.supportsRecorridos ?? true));
  mapLat = signal<number>(this.readNum('rt_mapLat', environment.map.center.lat));
  mapLng = signal<number>(this.readNum('rt_mapLng', environment.map.center.lng));
  mapZoom = signal<number>(this.readNum('rt_mapZoom', environment.map.zoom));

  saving = signal<boolean>(false);

  constructor(private supabase: SupabaseService) {}

  private readBool(key: string, fallback: boolean): boolean {
    const raw = localStorage.getItem(key);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return fallback;
    }

  private readNum(key: string, fallback: number): number {
    const raw = localStorage.getItem(key);
    const n = raw !== null ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : fallback;
  }

  async saveAppSettings() {
    this.saving.set(true);
    try {
      localStorage.setItem('rt_supportsRec', String(this.supportsRecorridos()));
      localStorage.setItem('rt_mapLat', String(this.mapLat()));
      localStorage.setItem('rt_mapLng', String(this.mapLng()));
      localStorage.setItem('rt_mapZoom', String(this.mapZoom()));
    } finally {
      this.saving.set(false);
    }
  }

  async reloadRole() {
    await this.supabase.loadCurrentUserAndProfile();
  }

  async clearLocalCache() {
    try {
      localStorage.removeItem('rt_supportsRec');
      localStorage.removeItem('rt_mapLat');
      localStorage.removeItem('rt_mapLng');
      localStorage.removeItem('rt_mapZoom');
    } catch {}
    this.supportsRecorridos.set(environment.api.supportsRecorridos ?? true);
    this.mapLat.set(environment.map.center.lat);
    this.mapLng.set(environment.map.center.lng);
    this.mapZoom.set(environment.map.zoom);
  }
}
