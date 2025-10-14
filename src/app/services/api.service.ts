import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { firstValueFrom } from 'rxjs';

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
  modelo: string;
  color: string;
  capacidad: number;
  estado: 'activo' | 'inactivo' | 'mantenimiento';
  ruta_id: string;
  created_at: string;
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
    const url = `${this.baseUrl}rutas?profile_id=${this.profileId}&perfil_id=${this.profileId}`;
    console.log('API Service - Solicitando rutas desde:', url);
    const response = await firstValueFrom(this.http.get<{data: Ruta[]}>(url));
    return response?.data || [];
  }

  // Obtener una ruta específica
  async getRuta(id: string): Promise<Ruta> {
    const response = await firstValueFrom(this.http.get<{data: Ruta}>(`${this.baseUrl}rutas/${id}?profile_id=${this.profileId}&perfil_id=${this.profileId}`));
    return response?.data;
  }

  // Obtener puntos de una ruta
  async getPuntosRuta(rutaId: string): Promise<PuntoRuta[]> {
    const response = await firstValueFrom(this.http.get<{data: PuntoRuta[]}>(`${this.baseUrl}rutas/${rutaId}/puntos?profile_id=${this.profileId}&perfil_id=${this.profileId}`));
    return response?.data || [];
  }

  // Obtener vehículos
  async getVehiculos(): Promise<Vehiculo[]> {
    const url = `${this.baseUrl}vehiculos?profile_id=${this.profileId}&perfil_id=${this.profileId}`;
    console.log('API Service - Solicitando vehículos desde:', url);
    const response = await firstValueFrom(this.http.get<{data: Vehiculo[]}>(url));
    return response?.data || [];
  }

  // Obtener ubicación actual de un vehículo
  async getUbicacionVehiculo(vehiculoId: string): Promise<UbicacionVehiculo> {
    const response = await firstValueFrom(this.http.get<{data: UbicacionVehiculo}>(`${this.baseUrl}vehiculos/${vehiculoId}/ubicacion?profile_id=${this.profileId}&perfil_id=${this.profileId}`));
    return response?.data;
  }

  // Obtener historial de ubicaciones de un vehículo
  async getHistorialUbicaciones(vehiculoId: string, fechaInicio?: string, fechaFin?: string): Promise<UbicacionVehiculo[]> {
    let url = `${this.baseUrl}vehiculos/${vehiculoId}/historial?profile_id=${this.profileId}&perfil_id=${this.profileId}`;
    
    if (fechaInicio) {
      url += `&fecha_inicio=${fechaInicio}`;
    }
    if (fechaFin) {
      url += `&fecha_fin=${fechaFin}`;
    }
    
    const response = await firstValueFrom(this.http.get<{data: UbicacionVehiculo[]}>(url));
    return response?.data || [];
  }

  // --- CRUD de Vehículos ---
  // Crear vehículo
  async createVehiculo(payload: Partial<Vehiculo>): Promise<Vehiculo> {
    const url = `${this.baseUrl}vehiculos?profile_id=${this.profileId}&perfil_id=${this.profileId}`;
    console.log('API Service - Creando vehículo en:', url, payload);
    return await firstValueFrom(this.http.post<Vehiculo>(url, payload));
  }

  // Actualizar vehículo
  async updateVehiculo(id: string, payload: Partial<Vehiculo>): Promise<Vehiculo> {
    const url = `${this.baseUrl}vehiculos/${id}?profile_id=${this.profileId}&perfil_id=${this.profileId}`;
    console.log('API Service - Actualizando vehículo en:', url, payload);
    return await firstValueFrom(this.http.put<Vehiculo>(url, payload));
  }

  // Eliminar vehículo
  async deleteVehiculo(id: string): Promise<any> {
    const url = `${this.baseUrl}vehiculos/${id}?profile_id=${this.profileId}&perfil_id=${this.profileId}`;
    console.log('API Service - Eliminando vehículo en:', url);
    return await firstValueFrom(this.http.delete<any>(url));
  }

  // Obtener calles y direcciones
  async getCalles(): Promise<any[]> {
    return await firstValueFrom(this.http.get<any[]>(`${this.baseUrl}calles?profile_id=${this.profileId}&perfil_id=${this.profileId}`));
  }

  // Buscar direcciones
  async buscarDirecciones(query: string): Promise<any[]> {
    return await firstValueFrom(this.http.get<any[]>(`${this.baseUrl}buscar?q=${encodeURIComponent(query)}&profile_id=${this.profileId}&perfil_id=${this.profileId}`));
  }

  // Obtener información de Buenaventura
  async getInfoBuenaventura(): Promise<any> {
    return await firstValueFrom(this.http.get<any>(`${this.baseUrl}buenaventura?profile_id=${this.profileId}&perfil_id=${this.profileId}`));
  }
}
