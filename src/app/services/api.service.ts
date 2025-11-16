import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { firstValueFrom, throwError } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { Capacitor, CapacitorHttp, HttpOptions } from '@capacitor/core';

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
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = environment.api.baseUrl;
  private profileId = environment.api.profileId;

  constructor(private http: HttpClient) {}

  // Obtener todas las rutas
  async getRutas(): Promise<Ruta[]> {
    const url = `${this.baseUrl}rutas?perfil_id=${this.profileId}`;
    console.log('API Service - Solicitando rutas desde:', url);
    if (Capacitor.isNativePlatform()) {
      const opts: HttpOptions = { url, method: 'GET', headers: { Accept: 'application/json' } };
      const response = await CapacitorHttp.get(opts);
      const body = response?.data;
      if (Array.isArray(body)) return body as Ruta[];
      if (body && Array.isArray(body.data)) return body.data as Ruta[];
      return [];
    }
    const response = await firstValueFrom(this.http.get<any>(url).pipe(timeout(12000), catchError(err => { console.warn('API getRutas error:', err?.status, err?.message); return throwError(() => err); })));
    // Soportar respuesta paginada { data: Ruta[], ... } o directa Ruta[]
    if (Array.isArray(response)) {
      return response as Ruta[];
    }
    if (response && Array.isArray(response.data)) {
      return response.data as Ruta[];
    }
    return [];
  }

  // Obtener una ruta específica
  async getRuta(id: string): Promise<Ruta> {
    const url = `${this.baseUrl}rutas/${id}?perfil_id=${this.profileId}`;
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({ url, method: 'GET', headers: { Accept: 'application/json' } });
      return (res?.data?.data as Ruta) ?? null as any;
    }
    const response = await firstValueFrom(this.http.get<{data: Ruta}>(url).pipe(timeout(12000)));
    return response?.data as any;
  }

  // Obtener puntos de una ruta
  async getPuntosRuta(rutaId: string): Promise<PuntoRuta[]> {
    const url = `${this.baseUrl}rutas/${rutaId}/puntos?perfil_id=${this.profileId}`;
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({ url, method: 'GET', headers: { Accept: 'application/json' } });
      return (res?.data?.data as PuntoRuta[]) || [];
    }
    const response = await firstValueFrom(this.http.get<{data: PuntoRuta[]}>(url).pipe(timeout(12000)));
    return response?.data || [];
  }

  // Obtener vehículos
  async getVehiculos(): Promise<Vehiculo[]> {
    const url = `${this.baseUrl}vehiculos?perfil_id=${this.profileId}`;
    console.log('API Service - Solicitando vehículos desde:', url);
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({ url, method: 'GET', headers: { Accept: 'application/json' } });
      return (res?.data?.data as Vehiculo[]) || [];
    }
    const response = await firstValueFrom(this.http.get<{data: Vehiculo[]}>(url).pipe(timeout(12000), catchError(err => { console.warn('API getVehiculos error:', err?.status, err?.message); return throwError(() => err); })));
    return response?.data || [];
  }

  // Obtener ubicación actual de un vehículo
  async getUbicacionVehiculo(vehiculoId: string): Promise<UbicacionVehiculo> {
    // Endpoint no disponible en API pública actual
    console.warn('API Service - getUbicacionVehiculo no soportado por API. Retornando mock.');
    return Promise.resolve({
      id: '', vehiculo_id: vehiculoId, latitud: 0, longitud: 0, velocidad: 0, direccion: 0, timestamp: new Date().toISOString(), created_at: new Date().toISOString()
    });
  }

  // Obtener historial de ubicaciones de un vehículo
  async getHistorialUbicaciones(vehiculoId: string, fechaInicio?: string, fechaFin?: string): Promise<UbicacionVehiculo[]> {
    // Endpoint no disponible en API pública actual
    console.warn('API Service - getHistorialUbicaciones no soportado por API. Retornando lista vacía.');
    return Promise.resolve([]);
  }

  // --- CRUD de Vehículos ---
  // Crear vehículo
  async createVehiculo(payload: Partial<Pick<Vehiculo, 'placa' | 'modelo' | 'marca' | 'activo'>>): Promise<Vehiculo> {
    const url = `${this.baseUrl}vehiculos?perfil_id=${this.profileId}`;
    console.log('API Service - Creando vehículo en:', url, payload);
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.post({ url, headers: { 'Content-Type': 'application/json' }, data: payload });
      return (res?.data as Vehiculo) as any;
    }
    return await firstValueFrom(this.http.post<Vehiculo>(url, payload).pipe(timeout(12000)));
  }

  // Actualizar vehículo
  async updateVehiculo(id: string, payload: Partial<Pick<Vehiculo, 'placa' | 'modelo' | 'marca' | 'activo'>>): Promise<Vehiculo> {
    const url = `${this.baseUrl}vehiculos/${id}?perfil_id=${this.profileId}`;
    console.log('API Service - Actualizando vehículo en:', url, payload);
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.put({ url, headers: { 'Content-Type': 'application/json' }, data: payload });
      return (res?.data as Vehiculo) as any;
    }
    return await firstValueFrom(this.http.put<Vehiculo>(url, payload).pipe(timeout(12000)));
  }

  // Eliminar vehículo
  async deleteVehiculo(id: string): Promise<any> {
    const url = `${this.baseUrl}vehiculos/${id}?perfil_id=${this.profileId}`;
    console.log('API Service - Eliminando vehículo en:', url);
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.delete({ url });
      return res?.data;
    }
    return await firstValueFrom(this.http.delete<any>(url).pipe(timeout(12000)));
  }

  // Obtener calles
  async getCalles(): Promise<Calle[]> {
    const url = `${this.baseUrl}calles?perfil_id=${this.profileId}`;
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({ url, method: 'GET', headers: { Accept: 'application/json' } });
      const resp = res?.data;
      if (Array.isArray(resp)) return resp as Calle[];
      if (resp && Array.isArray(resp.data)) return resp.data as Calle[];
      return [];
    }
    const resp = await firstValueFrom(this.http.get<any>(url).pipe(timeout(12000)));
    // Soporta formato [{...}] o { data: [{...}] }
    if (Array.isArray(resp)) return resp as Calle[];
    if (resp && Array.isArray(resp.data)) return resp.data as Calle[];
    return [];
  }

  // Buscar direcciones
  async buscarDirecciones(query: string): Promise<any[]> {
    const url = `${this.baseUrl}buscar?q=${encodeURIComponent(query)}&perfil_id=${this.profileId}`;
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
}
