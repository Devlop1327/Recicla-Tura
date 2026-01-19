import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { firstValueFrom, throwError } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { Capacitor, CapacitorHttp, HttpOptions } from '@capacitor/core';
import { SupabaseService } from './supabase.service';

export interface Ruta {
  id: string;
  nombre: string;
  descripcion: string;
  color: string;
  puntos: PuntoRuta[];
  activa: boolean;
  created_at: string;
  updated_at: string;
}

export interface Calle {
  id: string;
  nombre: string;
  shape: string; // GeoJSON serializado
}

export interface PuntoRuta {
  id: string;
  ruta_id: string;
  latitud: number;
  longitud: number;
  orden: number;
  nombre: string;
  descripcion: string;
  horario_estimado: string;
  created_at: string;
}

export interface Vehiculo {
  id: string;
  placa: string;
  modelo: string | null;
  estado?: 'disponible' | 'en_ruta' | 'mantenimiento' | string;
  marca: string | null;
  activo: boolean;
  perfil_id: string;
  created_at: string;
  updated_at: string;
}

export interface UbicacionVehiculo {
  id: string;
  vehiculo_id: string;
  latitud: number;
  longitud: number;
  velocidad: number;
  direccion: number;
  timestamp: string;
  created_at: string;
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private baseUrl = environment.api.baseUrl;
  private profileId = environment.api.profileId;

  constructor(private http: HttpClient, private supabase: SupabaseService) {}

  // Obtener todas las rutas (solo desde Supabase)
  async getRutas(): Promise<Ruta[]> {
    try {
      const { data, error } = await this.supabase.getRutas();
      if (error) {
        console.warn('ApiService.getRutas - error desde Supabase:', error);
        return [];
      }
      return (Array.isArray(data) ? (data as any[]) : []) as Ruta[];
    } catch (e) {
      console.error('ApiService.getRutas - excepción:', e);
      return [];
    }
  }

  // Obtener una ruta específica (solo desde Supabase)
  async getRuta(id: string): Promise<Ruta> {
    try {
      const { data, error } = await this.supabase.getRuta(id);
      if (error) {
        console.warn('ApiService.getRuta - error desde Supabase:', error);
        return null as any;
      }
      return data as Ruta;
    } catch (e) {
      console.error('ApiService.getRuta - excepción:', e);
      return null as any;
    }
  }

  // Obtener puntos de una ruta (solo desde Supabase)
  async getPuntosRuta(rutaId: string): Promise<PuntoRuta[]> {
    try {
      const { data, error } = await this.supabase.getPuntosRuta(rutaId);
      if (error) {
        console.warn('ApiService.getPuntosRuta - error desde Supabase:', error);
        return [];
      }
      return (Array.isArray(data) ? (data as any[]) : []) as PuntoRuta[];
    } catch (e) {
      console.error('ApiService.getPuntosRuta - excepción:', e);
      return [];
    }
  }

  // Obtener vehículos (solo desde Supabase, sin API externa)
  async getVehiculos(): Promise<Vehiculo[]> {
    try {
      const { data, error } = await this.supabase.getVehiculos();
      if (error) {
        console.warn('ApiService.getVehiculos - error desde Supabase:', error);
        return [];
      }
      return (Array.isArray(data) ? (data as any[]) : []) as Vehiculo[];
    } catch (e) {
      console.error('ApiService.getVehiculos - excepción:', e);
      return [];
    }
  }

  // Obtener ubicación actual de un vehículo
  async getUbicacionVehiculo(vehiculoId: string): Promise<UbicacionVehiculo> {
    return Promise.resolve({
      id: '',
      vehiculo_id: vehiculoId,
      latitud: 0,
      longitud: 0,
      velocidad: 0,
      direccion: 0,
      timestamp: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
  }

  // Obtener historial de ubicaciones de un vehículo
  async getHistorialUbicaciones(
    vehiculoId: string,
    fechaInicio?: string,
    fechaFin?: string
  ): Promise<UbicacionVehiculo[]> {
    // Endpoint no disponible en API pública actual
    console.warn(
      'API Service - getHistorialUbicaciones no soportado por API. Retornando lista vacía.'
    );
    return Promise.resolve([]);
  }

  // Obtener calles
  async getCalles(): Promise<Calle[]> {
    const url = `${this.baseUrl}calles?perfil_id=${this.profileId}`;
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({
        url,
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const resp = res?.data;
      if (Array.isArray(resp)) return resp as Calle[];
      if (resp && Array.isArray(resp.data)) return resp.data as Calle[];
      return [];
    }
    const resp = await firstValueFrom(
      this.http.get<any>(url).pipe(timeout(12000))
    );
    // Soporta formato [{...}] o { data: [{...}] }
    if (Array.isArray(resp)) return resp as Calle[];
    if (resp && Array.isArray(resp.data)) return resp.data as Calle[];
    return [];
  }

  // Buscar direcciones
  async buscarDirecciones(query: string): Promise<any[]> {
    const url = `${this.baseUrl}buscar?q=${encodeURIComponent(
      query
    )}&perfil_id=${this.profileId}`;
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({ url });
      return (res?.data as any[]) || [];
    }
    return await firstValueFrom(this.http.get<any[]>(url).pipe(timeout(12000)));
  }

  // Obtener información de Buenaventura
  async getInfoBuenaventura(): Promise<any> {
    const url = `${this.baseUrl}buenaventura?perfil_id=${this.profileId}`;
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({ url });
      return res?.data;
    }
    return await firstValueFrom(this.http.get<any>(url).pipe(timeout(12000)));
  }

  // Recorridos: iniciar
  async iniciarRecorrido(payload: {
    ruta_id: string;
    vehiculo_id: string;
    perfil_id?: string;
  }): Promise<any> {
    const url = `${this.baseUrl}recorridos/iniciar?perfil_id=${this.profileId}`;
    const body = { ...payload, perfil_id: payload.perfil_id ?? this.profileId };
    console.log('API Service - Iniciar recorrido:', url, body);
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.post({
        url,
        headers: { 'Content-Type': 'application/json' },
        data: body,
      });
      const data = res?.data as any;
      return data?.data ?? data;
    }
    const resp = await firstValueFrom(
      this.http.post<any>(url, body).pipe(timeout(12000))
    );
    return resp?.data ?? resp;
  }

  // Recorridos: registrar posición
  async registrarPosicion(
    recorridoId: string,
    payload: { lat: number; lon: number; perfil_id?: string }
  ): Promise<any> {
    const url = `${this.baseUrl}recorridos/${recorridoId}/posiciones?perfil_id=${this.profileId}`;
    const body = { ...payload, perfil_id: payload.perfil_id ?? this.profileId };
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.post({
        url,
        headers: { 'Content-Type': 'application/json' },
        data: body,
      });
      const data = res?.data as any;
      return data?.data ?? data;
    }
    const resp = await firstValueFrom(
      this.http.post<any>(url, body).pipe(timeout(12000))
    );
    return resp?.data ?? resp;
  }
}
