import { Component, OnDestroy, computed, signal } from '@angular/core';
import { IonicModule, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { RecorridosService } from '../../services/recorridos.service';
import { MapDataService } from '../../services/map-data.service';
import { SupabaseService } from '../../services/supabase.service';

import * as L from 'leaflet';
import { Geolocation } from '@capacitor/geolocation';


@Component({
  selector: 'app-conductor-recorrido',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './conductor-recorrido.page.html',
  styleUrls: ['./conductor-recorrido.page.scss']
})
export class ConductorRecorridoPage implements OnDestroy {
  activo = computed(() => this.recorridos.hasActiveRecorrido());
  routeName = computed(() => this.recorridos.getCurrentRouteName());
  lat = signal<number | null>(null);
  lng = signal<number | null>(null);
  velocidad = signal<number | null>(null);
  lastApiOk = signal<boolean | null>(null);
  lastSupabaseOk = signal<boolean | null>(null);
  errorMsg = signal<string | null>(null);
  paused = signal<boolean>(false);
  accuracy = signal<number | null>(null);

  private watchId: number | null = null;
  private map: L.Map | null = null;
  private marker: L.Marker | null = null;
  private polyline: L.Polyline | null = null;
  private accuracyCircle: L.Circle | null = null;
  private path: L.LatLng[] = [];
  private routeCoords: L.LatLng[] = [];
  private simIndex = 0;
  private simTimer: any = null;
  private broadcastChannel: any = null;
  private lastPersistAt = 0;
  private persistIntervalMs = 5000; // persistir cada 5s

  constructor(
    private recorridos: RecorridosService,
    private router: Router,
    private mapData: MapDataService,
    private supabaseSvc: SupabaseService,
    private toastCtrl: ToastController
  ) {}

  ionViewWillEnter() {
    // unir canal de broadcast para posiciones en vivo
    if (!this.broadcastChannel) {
      this.broadcastChannel = this.supabaseSvc.getChannel('positions-broadcast');
      try { this.broadcastChannel.subscribe(); } catch {}
    }
    this.ensureMap();
    // Siempre cargar la geometría de la ruta seleccionada y dibujarla
    this.loadAndShowRouteShape().then(() => {
      if (this.activo() && !this.paused()) {
        // Si hay geometría de ruta, simular movimiento siguiendo la línea
        if (this.routeCoords.length > 1) {
          this.startSimulation();
        } else {
          // Fallback: usar geolocalización si no hay shape
          this.startWatching();
        }
      } else {
        this.stopWatching();
        this.stopSimulation();
      }
    });
  }

  ionViewWillLeave() {
    this.stopWatching();
    this.stopSimulation();
    if (this.broadcastChannel) {
      try { this.supabaseSvc.supabase.removeChannel(this.broadcastChannel); } catch {}
      this.broadcastChannel = null;
    }
  }

  ngOnDestroy(): void {
    this.stopWatching();
    this.stopSimulation();
    this.destroyMap();
    if (this.broadcastChannel) {
      try { this.supabaseSvc.supabase.removeChannel(this.broadcastChannel); } catch {}
      this.broadcastChannel = null;
    }
  }

  private startWatching() {
    if (this.paused()) return;
    if (!('geolocation' in navigator)) {
      this.errorMsg.set('Geolocalización no disponible en este dispositivo');
      return;
    }
    // Asegurar permisos en Android/iOS con Capacitor
    this.ensureGeoPermission().catch(() => {});
    if (this.watchId !== null) return;
    this.errorMsg.set(null);
    this.watchId = navigator.geolocation.watchPosition(
      async pos => {
        const coords = pos.coords;
        this.lat.set(coords.latitude);
        this.lng.set(coords.longitude);
        this.velocidad.set(Number.isFinite(coords.speed || NaN) ? (coords.speed as number) : null);
        this.accuracy.set(Number.isFinite(coords.accuracy || NaN) ? (coords.accuracy as number) : null);
        this.appendPathPoint(coords.latitude, coords.longitude);
        this.updateMapMarker();
        await this.pushPosition();
      },
      err => {
        this.errorMsg.set(err?.message || 'Error de geolocalización');
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
  }

  private stopWatching() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  private async ensureGeoPermission() {
    try {
      const stat = await Geolocation.checkPermissions();
      const loc = (stat as any)?.location;
      if (loc !== 'granted' && loc !== 'limited') {
        await Geolocation.requestPermissions();
      }
    } catch {}
  }

  private async loadAndShowRouteShape() {
    try {
      const routeId = this.recorridos.getCurrentRouteId();
      if (!routeId) return;
      const ruta = await this.mapData.getRuta(routeId);
      const shapeStr = (ruta as any)?.shape || (ruta as any)?.shape_ruta || null;
      if (!shapeStr) return;
      let geo: any = null;
      try { geo = typeof shapeStr === 'string' ? JSON.parse(shapeStr) : shapeStr; } catch { geo = null; }
      if (!geo) return;
      if (geo.type === 'LineString' && Array.isArray(geo.coordinates)) {
        this.routeCoords = geo.coordinates.map((c: any) => L.latLng(c[1], c[0]));
      } else if (geo.type === 'Feature' && geo.geometry?.type === 'LineString') {
        this.routeCoords = (geo.geometry.coordinates || []).map((c: any) => L.latLng(c[1], c[0]));
      } else if (geo.type === 'FeatureCollection') {
        const first = (geo.features || []).find((f: any) => f.geometry?.type === 'LineString');
        if (first?.geometry?.coordinates) {
          this.routeCoords = first.geometry.coordinates.map((c: any) => L.latLng(c[1], c[0]));
        }
      }
      if (this.routeCoords.length > 1) {
        // Dibujar la línea de la ruta
        if (this.polyline) {
          this.polyline.setLatLngs(this.routeCoords);
        } else if (this.map) {
          this.polyline = L.polyline(this.routeCoords, { color: '#1976d2', weight: 5 }).addTo(this.map);
        }
        // Centrar mapa al inicio
        const start = this.routeCoords[0];
        if (start) {
          this.lat.set(start.lat);
          this.lng.set(start.lng);
          this.updateMapMarker(true);
        }
      }
    } catch (e) {
      console.warn('[Recorrido] No fue posible cargar la geometría de la ruta', e);
    }
  }

  private startSimulation() {
    if (this.simTimer) return;
    if (this.routeCoords.length < 2) return;
    this.errorMsg.set(null);
    this.simIndex = 0;
    const stepMs = 1000; // 1 segundo por punto
    this.simTimer = setInterval(async () => {
      if (this.paused()) return;
      const pt = this.routeCoords[this.simIndex];
      if (!pt) { this.stopSimulation(); return; }
      this.lat.set(pt.lat);
      this.lng.set(pt.lng);
      this.velocidad.set(5); // m/s aproximado para enviar
      this.appendPathPoint(pt.lat, pt.lng);
      this.updateMapMarker(this.simIndex === 0);
      await this.pushPosition();
      this.simIndex++;
      if (this.simIndex >= this.routeCoords.length) {
        // Llegó al final: finalizar automáticamente
        await this.finalizar();
      }
    }, stepMs);
  }

  private stopSimulation() {
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
  }

  private async pushPosition() {
    const recId = this.recorridos.getActiveRecorridoId();
    if (!recId) return;
    const lat = this.lat();
    const lng = this.lng();
    const vel = this.velocidad() ?? undefined;
    if (lat == null || lng == null) return;
    // Emitir por broadcast en tiempo real (sin escribir BD)
    try {
      await this.supabaseSvc.broadcastPosition(this.broadcastChannel, { recorrido_id: recId, ruta_id: this.recorridos.getCurrentRouteId() ?? null, lat, lng });
    } catch {}
    // Enviar a API externa
    const now = Date.now();
    if (now - this.lastPersistAt >= this.persistIntervalMs) {
      const apiOk = await this.mapData.registrarPosicion(recId, lat, lng, vel);
      this.lastApiOk.set(!!apiOk);
      // Guardar en Supabase
      try {
        const rutaId = this.recorridos.getCurrentRouteId();
        const { error } = await this.supabaseSvc.createUbicacion({ recorrido_id: recId, ruta_id: rutaId ?? null, lat, lng, velocidad: vel ?? null });
        this.lastSupabaseOk.set(!error);
      } catch {
        this.lastSupabaseOk.set(false);
      }
      this.lastPersistAt = now;
    }
  }

  togglePause() {
    const next = !this.paused();
    this.paused.set(next);
    if (next) {
      this.stopWatching();
    } else {
      if (this.routeCoords.length > 1) {
        // reanudar simulación (timer ya sigue corriendo, solo retomará al siguiente tick)
      } else {
        this.startWatching();
      }
    }
  }

  private ensureMap() {
    if (this.map) return;
    const el = document.getElementById('recorrido-map');
    if (!el) return;
    this.map = L.map(el).setView([3.8833, -77.0167], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);
    if (this.lat() != null && this.lng() != null) {
      this.updateMapMarker(true);
    }
    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  private updateMapMarker(center = false) {
    if (!this.map) this.ensureMap();
    if (!this.map) return;
    const lat = this.lat();
    const lng = this.lng();
    if (lat == null || lng == null) return;
    const ll: L.LatLngExpression = [lat, lng];
    if (this.marker) {
      this.marker.setLatLng(ll);
    } else {
      this.marker = L.marker(ll).addTo(this.map);
    }
    if (this.path.length >= 2) {
      if (this.polyline) {
        this.polyline.setLatLngs(this.path);
      } else {
        this.polyline = L.polyline(this.path, { color: '#4caf50', weight: 4 }).addTo(this.map as L.Map);
      }
    }
    const acc = this.accuracy();
    if (acc != null && isFinite(acc)) {
      if (this.accuracyCircle) {
        this.accuracyCircle.setLatLng(ll as L.LatLngExpression);
        this.accuracyCircle.setRadius(acc);
      } else {
        this.accuracyCircle = L.circle(ll as L.LatLngExpression, { radius: acc, color: '#2196f3', opacity: 0.3, fillOpacity: 0.1 }).addTo(this.map as L.Map);
      }
    }
    if (center) {
      this.map.setView(ll, Math.max(this.map.getZoom(), 15));
    }
  }

  private appendPathPoint(lat: number, lng: number) {
    const pt = L.latLng(lat, lng);
    this.path.push(pt);
    if (this.path.length > 1000) {
      this.path.shift();
    }
  }

  private destroyMap() {
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.marker = null;
      this.polyline = null;
      this.accuracyCircle = null;
      this.path = [];
    }
  }

  async finalizar() {
    await this.recorridos.stopRecorrido();
    this.stopWatching();
    this.destroyMap();
    const toast = await this.toastCtrl.create({ message: 'Recorrido finalizado', duration: 1500, color: 'success' });
    await toast.present();
    await this.router.navigateByUrl('/conductor/rutas');
  }
}
