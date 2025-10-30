import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class RecorridosService {
  private active = signal(false);
  private currentRouteId = signal<string | null>(null);

  constructor(private supabase: SupabaseService) {}

  hasActiveRecorrido() {
    return this.active();
  }

  async getAssignedRutas() {
    return [] as Array<{ id: string; nombre: string }>;
  }

  async startRecorrido(routeId: string) {
    this.currentRouteId.set(routeId);
    this.active.set(true);
  }

  async stopRecorrido() {
    this.active.set(false);
    this.currentRouteId.set(null);
  }
}
