import { Component, AfterViewInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, AlertController } from '@ionic/angular';
import { HttpClientModule } from '@angular/common/http';
import * as L from 'leaflet';
import { MapDataService, RutaApiItem, RecorridoApiItem, PosicionApiItem } from '../../services/map-data.service';
import { ApiService, Vehiculo } from '../../services/api.service';
import { SupabaseService } from '../../services/supabase.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-mapa',
  templateUrl: './mapa.page.html',
  styleUrls: ['./mapa.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, HttpClientModule]
})
export class MapaPage implements AfterViewInit {
  private map: any;
  private callesLayer: L.GeoJSON | null = null;
  private rutasLayer: L.GeoJSON | null = null;
  private selectedRutaLayer: L.GeoJSON | L.Polyline | null = null;
  private recorridoPolyline: L.Polyline | null = null;
  private recorridoMarker: L.Marker | null = null;
  private posicionesTimer: any = null;
  private promoteTimer: any = null;
  private routeCoords: L.LatLng[] = [];
  private simTimer: any = null;
  private simIndex = 0;
  private simPolyline: L.Polyline | null = null;
  private simMarker: L.Marker | null = null;
  private simPath: L.LatLng[] = [];
  private vehicleIcon: L.Icon | null = null;
  // Throttle for posting positions
  private lastApiPosAtMs = 0;
  private lastSupaPosAtMs = 0;
  private readonly MIN_API_POS_MS = 5000; // >=5s para API externa
  private readonly MIN_SUPA_POS_MS = 4000; // >=4s para Supabase
  private readonly LAST_POS_KEY = 'rt_last_conductor_pos';
  realTracking = signal(true);
  private watchId: number | null = null;
  private snapIndex = 0;
  private snapSeg = 0;
  private lastSnap: L.LatLng | null = null;
  private finishPromptShown = false;
  showCalles = signal(true);
  showRutas = signal(true);
  rutas = signal<RutaApiItem[]>([]);
  selectedRutaId = signal<string | null>(null);
  activeRecorrido = signal<RecorridoApiItem | null>(null);
  readonly supportsRecorridos = environment.api.supportsRecorridos ?? false;
  userRole = signal<'admin' | 'conductor' | 'cliente' | null>(null);
  editing = signal(false);
  editingSelected = signal(false);
  private draftPoints: L.LatLng[] = [];
  private draftMarkers: L.Marker[] = [];
  private draftPolyline: L.Polyline | null = null;

  constructor(
    private mapData: MapDataService,
    private supabaseSvc: SupabaseService,
    private api: ApiService,
    private alertCtrl: AlertController
  ) { }

  ngAfterViewInit() {
    this.initMap();
    setTimeout(() => this.map?.invalidateSize(), 0);
    setTimeout(() => this.map?.invalidateSize(), 250);
    setTimeout(() => this.map?.invalidateSize(), 750);
    window.addEventListener('resize', this.onResize, { passive: true });
    this.loadCallesLayer();
    this.loadRutasLayer();
    // Cargar rol y luego iniciar observación para clientes
    this.loadUserRole().then(() => this.watchActiveRecorridosForClients());
  }

  // Encuentra el índice del punto más cercano en una polilínea
  private findNearestIndexOnPath(lat: number, lng: number, path: L.LatLng[]): number {
    if (!path || path.length === 0) return 0;
    let bestIdx = 0;
    let bestDist = Infinity;
    const p = L.latLng(lat, lng);
    for (let i = 0; i < path.length; i++) {
      const d = p.distanceTo(path[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  // Persistencia de última posición del conductor
  private persistLastConductorPos(recorridoId: string, lat: number, lng: number) {
    const payload = { recorridoId, lat, lng, ts: Date.now() };
    try { localStorage.setItem(this.LAST_POS_KEY, JSON.stringify(payload)); } catch {}
  }

  private restoreLastConductorPos(): { recorridoId: string; lat: number; lng: number; ts: number } | null {
    try {
      const raw = localStorage.getItem(this.LAST_POS_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (typeof obj?.lat === 'number' && typeof obj?.lng === 'number') return obj;
      return null;
    } catch { return null; }
  }

  private clearLastConductorPos() {
    try { localStorage.removeItem(this.LAST_POS_KEY); } catch {}
  }

  private removeClientLayers(recId: string) {
    // Eliminar marcador y línea de un recorrido específico (cliente)
    if (this.clientMarkers[recId]) {
      try { (this.map as L.Map).removeLayer(this.clientMarkers[recId]); } catch {}
      delete this.clientMarkers[recId];
    }
    if (this.clientPolylines[recId]) {
      try { (this.map as L.Map).removeLayer(this.clientPolylines[recId]); } catch {}
      delete this.clientPolylines[recId];
    }
  }

  ionViewWillEnter() {
    if (!this.map) {
      this.initMap();
    }
    this.map?.invalidateSize();
    setTimeout(() => this.map?.invalidateSize(), 150);
    this.loadCallesLayer();
    this.loadRutasLayer();
    this.loadUserRole().then(async () => {
      // Clientes: observar recorridos activos
      this.watchActiveRecorridosForClients();
      // Conductores: intentar restaurar posición y continuar si hay recorrido en curso
      if (this.userRole() === 'conductor') {
        // Pintar último punto inmediatamente si existe
        const restored = this.restoreLastConductorPos();
        if (restored) {
          try {
            const ll: L.LatLngExpression = [restored.lat, restored.lng];
            if (this.simMarker) {
              this.simMarker.setLatLng(ll);
            } else {
              this.simMarker = L.marker(ll, { title: 'Vehículo', icon: this.vehicleIcon ?? undefined }).addTo(this.map as L.Map);
            }
            (this.map as L.Map).panTo(ll, { animate: true });
          } catch {}
        }
        // Consultar si hay un recorrido en curso y reanudar
        try {
          const recs = await this.mapData.loadRecorridos();
          const isRunning = (s: string) => (s || '').toLowerCase().includes('progreso') || (s || '').toLowerCase().includes('curso');
          const running = (recs || []).find(r => isRunning(r.estado));
          if (running) {
            this.activeRecorrido.set(running);
            // Seleccionar y resaltar la ruta del recorrido para tener routeCoords
            if (running.ruta_id) {
              this.selectedRutaId.set(running.ruta_id);
              this.highlightSelectedRuta(running.ruta_id);
            }
            this.beginPollingPosiciones(running.id);
            // Reanudar movimiento del marcador del conductor
            setTimeout(() => {
              if (this.realTracking()) {
                this.startRealTracking();
              } else {
                this.startSimulation();
              }
            }, 500);
          }
        } catch {}
      }
    });
  }

  private async maybePromptFinish() {
    if (this.finishPromptShown) return;
    if (!this.activeRecorrido()) return;
    this.finishPromptShown = true;
    try {
      const alert = await this.alertCtrl.create({
        header: 'Fin de la ruta',
        message: 'Has llegado al final. ¿Deseas finalizar el recorrido ahora o hacerlo manualmente?',
        buttons: [
          {
            text: 'Manual',
            role: 'cancel',
            handler: () => {}
          },
          {
            text: 'Finalizar ahora',
            role: 'confirm',
            handler: async () => {
              await this.onFinishRecorrido();
            }
          }
        ]
      });
      await alert.present();
      await alert.onDidDismiss();
    } catch {}
  }

  onToggleRealTracking(ev: CustomEvent) {
    const value = (ev.detail as any)?.checked ?? true;
    const prev = this.realTracking();
    if (value === prev) return;
    this.realTracking.set(value);
    const hasActive = !!this.activeRecorrido();
    if (!hasActive) return;
    // Cambiar modos en caliente
    if (value) {
      if (this.simTimer) { clearInterval(this.simTimer); this.simTimer = null; }
      this.startRealTracking();
    } else {
      if (this.watchId !== null) { navigator.geolocation?.clearWatch?.(this.watchId); this.watchId = null; }
      this.startSimulation();
    }
  }

  private startRealTracking() {
    // Ensure map and polyline/marker
    if (this.simPolyline && this.map) { (this.map as L.Map).removeLayer(this.simPolyline); }
    this.simPolyline = L.polyline([], { color: '#2ecc71', weight: 4, opacity: 0.9 }).addTo(this.map as L.Map);
    if (this.simMarker && this.map) { (this.map as L.Map).removeLayer(this.simMarker); }
    this.simMarker = null;
    if (!('geolocation' in navigator)) {
      return;
    }
    // Build dense path for snapping
    if (!this.simPath || this.simPath.length < 2) {
      if (this.routeCoords && this.routeCoords.length >= 2) {
        this.simPath = this.densifyRoute(this.routeCoords, 5);
      } else {
        this.simPath = [];
      }
    }
    // Try to align snapping to last persisted position (resume from where it actually is)
    const restored = this.restoreLastConductorPos();
    if (restored && this.simPath && this.simPath.length >= 2) {
      const idx = this.findNearestIndexOnPath(restored.lat, restored.lng, this.simPath);
      this.snapSeg = Math.max(0, idx - 1);
      this.snapIndex = Math.max(0, idx - 1);
      this.lastSnap = this.simPath[idx] || null;
    } else {
      this.snapIndex = 0;
      this.snapSeg = 0;
      this.lastSnap = null;
    }
    if (this.watchId !== null) return;
    this.watchId = navigator.geolocation.watchPosition(
      async pos => {
        const rec = this.activeRecorrido();
        const rutaId = this.selectedRutaId();
        if (!rec || !rutaId) return;
        const rawLat = pos.coords.latitude;
        const rawLng = pos.coords.longitude;
        // Snap to route (forward only)
        const snap = this.snapToRoute(rawLat, rawLng);
        const lat = snap?.lat ?? rawLat;
        const lng = snap?.lng ?? rawLng;
        const vel = Number.isFinite(pos.coords.speed || NaN) ? (pos.coords.speed as number) : 5;
        const now = Date.now();
        if (rec.id && !rec.id.startsWith('local-') && (now - this.lastApiPosAtMs) >= this.MIN_API_POS_MS) {
          this.lastApiPosAtMs = now;
          await this.mapData.registrarPosicion(rec.id, lat, lng, vel);
        }
        if ((now - this.lastSupaPosAtMs) >= this.MIN_SUPA_POS_MS) {
          this.lastSupaPosAtMs = now;
          try { await this.supabaseSvc.createUbicacion({ recorrido_id: rec.id, ruta_id: rutaId, lat, lng, velocidad: vel }); } catch {}
        }
        // Update visuals
        if (this.simPolyline) {
          const pts = (this.simPolyline.getLatLngs() as L.LatLng[]);
          pts.push(L.latLng(lat, lng));
          this.simPolyline.setLatLngs(pts);
        }
        const ll: L.LatLngExpression = [lat, lng];
        if (this.simMarker) {
          this.simMarker.setLatLng(ll);
        } else {
          this.simMarker = L.marker(ll, { title: 'Vehículo', icon: this.vehicleIcon ?? undefined }).addTo(this.map as L.Map);
        }
        (this.map as L.Map).panTo(ll, { animate: true });
        // Persistir última posición para restauración
        try { this.persistLastConductorPos(rec.id, lat, lng); } catch {}
        // Auto-finish prompt if almost at the end of the route
        const end = this.simPath?.[this.simPath.length - 1];
        const distToEnd = end ? L.latLng(lat, lng).distanceTo(end) : Infinity;
        if (this.simPath && this.simPath.length > 2 && (this.snapSeg >= this.simPath.length - 2 || distToEnd < 15)) {
          await this.maybePromptFinish();
        }
      },
      _err => {},
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
  }

  // Snap a lat/lng to the nearest point ON ROUTE SEGMENTS with forward progress and jump guard
  private snapToRoute(lat: number, lng: number): { lat: number; lng: number } | null {
    if (!this.simPath || this.simPath.length < 2) return null;
    const p = L.latLng(lat, lng);
    const startSeg = Math.max(0, this.snapSeg - 5);
    const endSeg = Math.min(this.simPath.length - 2, this.snapSeg + 200);
    let bestSeg = -1;
    let bestT = 0;
    let bestPoint: L.LatLng | null = null;
    let bestDist = Infinity;
    for (let i = startSeg; i <= endSeg; i++) {
      const a = this.simPath[i];
      const b = this.simPath[i + 1];
      const proj = this.projectToSegment(p, a, b);
      if (proj.dist < bestDist) {
        bestDist = proj.dist;
        bestSeg = i;
        bestT = proj.t;
        bestPoint = proj.point;
      }
    }
    if (bestSeg < 0 || !bestPoint) return this.lastSnap ? { lat: this.lastSnap.lat, lng: this.lastSnap.lng } : null;
    // Guardar contra saltos laterales grandes (> 60m)
    const maxLateral = 20;
    if (bestDist > maxLateral && this.lastSnap) {
      return { lat: this.lastSnap.lat, lng: this.lastSnap.lng };
    }
    // Enforce forward progress: no retroceder segmento
    if (bestSeg < this.snapSeg) {
      bestSeg = this.snapSeg;
      bestPoint = this.simPath[bestSeg];
      bestT = 0;
    }
    // Actualizar índices: avanza a siguiente segmento solo si estás casi al final
    if (bestT > 0.95) {
      this.snapSeg = Math.min(bestSeg + 1, this.simPath.length - 2);
    } else {
      this.snapSeg = Math.max(this.snapSeg, bestSeg);
    }
    this.snapIndex = Math.max(this.snapIndex, bestSeg);
    this.lastSnap = bestPoint;
    return { lat: bestPoint.lat, lng: bestPoint.lng };
  }

  // Proyección de un punto a un segmento AB, retorna punto más cercano, t en [0,1] y distancia
  private projectToSegment(p: L.LatLng, a: L.LatLng, b: L.LatLng): { point: L.LatLng; t: number; dist: number } {
    // Convert lat/lng to planar meters (aprox) usando WebMercator simplificado
    const toXY = (ll: L.LatLng) => {
      const x = ll.lng * 111320 * Math.cos((ll.lat * Math.PI) / 180);
      const y = ll.lat * 110540;
      return { x, y };
    };
    const P = toXY(p);
    const A = toXY(a);
    const B = toXY(b);
    const ABx = B.x - A.x;
    const ABy = B.y - A.y;
    const APx = P.x - A.x;
    const APy = P.y - A.y;
    const denom = ABx * ABx + ABy * ABy || 1;
    let t = (APx * ABx + APy * ABy) / denom;
    t = Math.max(0, Math.min(1, t));
    const Qx = A.x + ABx * t;
    const Qy = A.y + ABy * t;
    // Convertir de nuevo a lat/lng aproximado
    const lat = Qy / 110540;
    const lng = Qx / (111320 * Math.cos((lat * Math.PI) / 180));
    const q = L.latLng(lat, lng);
    const dist = q.distanceTo(p);
    return { point: q, t, dist };
  }

  onSelectRuta(ev: CustomEvent) {
    const id = (ev.detail as any)?.value ?? null;
    this.selectedRutaId.set(id);
    if (id) this.highlightSelectedRuta(id);
    else this.clearSelectedRuta();
  }

  private clearSelectedRuta() {
    if (!this.map) return;
    if (this.selectedRutaLayer) {
      (this.map as L.Map).removeLayer(this.selectedRutaLayer as any);
      this.selectedRutaLayer = null;
    }
  }

  private highlightSelectedRuta(id: string) {
    if (!this.map) return;
    this.clearSelectedRuta();
    const r = (this.rutas() || []).find(x => x.id === id);
    if (!r) return;
    try {
      const shapeRaw: any = (r as any).shape ?? (r as any).shape_ruta ?? null;
      if (!shapeRaw) return;
      let geo: any = null;
      try { geo = typeof shapeRaw === 'string' ? JSON.parse(shapeRaw) : shapeRaw; } catch { geo = null; }
      if (!geo) return;
      let line: GeoJSON.LineString | null = null;
      if (geo.type === 'LineString') {
        line = geo as GeoJSON.LineString;
      } else if (geo.type === 'Feature' && geo.geometry?.type === 'LineString') {
        line = geo.geometry as GeoJSON.LineString;
      } else if (geo.type === 'FeatureCollection') {
        const first = (geo.features || []).find((f: any) => f?.geometry?.type === 'LineString');
        line = first?.geometry ?? null;
      }
      if (!line || !Array.isArray(line.coordinates)) {
        // Fallback: intentar obtener shape desde Supabase view rutas_geojson
        this.fetchAndDrawRutaFromSupabase(id);
        return;
      }
      this.routeCoords = (line.coordinates || []).map(([lng, lat]) => L.latLng(lat, lng));
      const layer = L.geoJSON({ type: 'Feature', geometry: line } as any, {
        style: () => ({ color: '#2196f3', weight: 5, opacity: 1 })
      }).addTo(this.map as L.Map);
      this.selectedRutaLayer = layer;
      // Fallback visual con polyline explícita
      try {
        const pl = L.polyline(this.routeCoords, { color: '#2196f3', weight: 4, opacity: 0.9 });
        pl.addTo(this.map as L.Map);
      } catch {}
      const bounds = (layer as any).getBounds?.();
      if (bounds) {
        (this.map as L.Map).fitBounds(bounds.pad(0.2));
      }
      // Asegurar que el mapa recompute tamaño tras pintar
      setTimeout(() => (this.map as L.Map)?.invalidateSize?.(), 0);
    } catch {}
  }

  private async fetchAndDrawRutaFromSupabase(id: string) {
    try {
      const { data, error } = await this.supabaseSvc.supabase
        .from('rutas_geojson')
        .select('shape')
        .eq('id', id)
        .single();
      if (error) return;
      const shapeRaw = (data as any)?.shape ?? null;
      if (!shapeRaw) return;
      let geo: any = null;
      try { geo = typeof shapeRaw === 'string' ? JSON.parse(shapeRaw) : shapeRaw; } catch { geo = null; }
      if (!geo) return;
      let line: GeoJSON.LineString | null = null;
      if (geo.type === 'LineString') {
        line = geo as GeoJSON.LineString;
      } else if (geo.type === 'Feature' && geo.geometry?.type === 'LineString') {
        line = geo.geometry as GeoJSON.LineString;
      } else if (geo.type === 'FeatureCollection') {
        const first = (geo.features || []).find((f: any) => f?.geometry?.type === 'LineString');
        line = first?.geometry ?? null;
      }
      if (!line || !Array.isArray(line.coordinates)) return;
      this.routeCoords = (line.coordinates || []).map(([lng, lat]) => L.latLng(lat, lng));
      const pl = L.polyline(this.routeCoords, { color: '#2196f3', weight: 4, opacity: 0.9 }).addTo(this.map as L.Map);
      const bounds = pl.getBounds?.();
      if (bounds) {
        (this.map as L.Map).fitBounds(bounds.pad(0.2));
      }
      setTimeout(() => (this.map as L.Map)?.invalidateSize?.(), 0);
    } catch {}
  }

  // Observa recorridos activos para clientes y actualiza el mapa
  private clientWatchTimer: any = null;
  private lastWatchedRecorridoId: string | null = null;
  private clientMarkers: Record<string, L.Marker> = {};
  private clientAnim: Record<string, { from: L.LatLng; to: L.LatLng; start: number; duration: number; raf: number | null }> = {};
  private realtimeChannel: any = null;
  private broadcastChannel: any = null;
  private clientPolylines: Record<string, L.Polyline> = {};
  private async watchActiveRecorridosForClients() {
    const role = this.userRole();
    if (role === 'conductor') {
      // El conductor maneja su propio polling al iniciar recorrido
      if (this.clientWatchTimer) {
        clearInterval(this.clientWatchTimer);
        this.clientWatchTimer = null;
      }
      if (this.realtimeChannel) {
        try { await this.supabaseSvc.supabase.removeChannel(this.realtimeChannel); } catch {}
        this.realtimeChannel = null;
      }
      return;
    }
    // Semilla inicial: pintar recorridos activos completos y limpiar completados
    try {
      const recs = await this.mapData.loadRecorridos();
      const isRunning = (s: string) => (s || '').toLowerCase().includes('progreso') || (s || '').toLowerCase().includes('curso');
      const activos = (recs || []).filter(r => isRunning(r.estado));
      const completados = (recs || []).filter(r => (r.estado || '').toLowerCase().includes('complet'));
      // Limpiar completados
      for (const r of completados) {
        this.removeClientLayers(r.id as any);
      }
      for (const r of activos) {
        try {
          const posiciones = await this.mapData.listarPosiciones(r.id as any);
          const n = Array.isArray(posiciones) ? posiciones.length : 0;
          const last = n > 0 ? posiciones[n - 1] : null;
          const prev = n > 1 ? posiciones[n - 2] : null;
          if (last && typeof last.lat === 'number' && typeof last.lng === 'number' && this.map) {
            if (prev) {
              this.animateClientMarker(r.id as any, L.latLng(prev.lat, prev.lng), L.latLng(last.lat, last.lng), this.estimateClientDurationMs(prev as any, last as any));
            } else {
              this.drawClientMarker(r.id as any, last.lat, last.lng);
            }
            (this.map as L.Map).panTo([last.lat, last.lng], { animate: true });
          }
        } catch {}
      }
    } catch {}

    // Suscripción en tiempo real a ubicaciones nuevas (persistidas en BD)
    if (this.realtimeChannel) {
      try { await this.supabaseSvc.supabase.removeChannel(this.realtimeChannel); } catch {}
      this.realtimeChannel = null;
    }
    this.realtimeChannel = this.supabaseSvc.supabase
      .channel('ubicaciones-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ubicaciones' }, (payload: any) => {
        try {
          const row = payload?.new || {};
          const recId: string = row.recorrido_id || row.ruta_id;
          const lat: number = (row.lat ?? row.latitud) as number;
          const lng: number = (row.lng ?? row.longitud) as number;
          if (typeof lat === 'number' && typeof lng === 'number' && recId && this.map) {
            const m = this.clientMarkers[recId];
            const from = m ? (m.getLatLng() as L.LatLng) : null;
            const to = L.latLng(lat, lng);
            if (from) {
              this.animateClientMarker(recId, from, to, this.MIN_SUPA_POS_MS - 200);
            } else {
              this.drawClientMarker(recId, lat, lng);
            }
            (this.map as L.Map).panTo([lat, lng], { animate: true });
          }
        } catch {}
      })
      .subscribe((status: any) => {
        // no-op; solo asegurar suscripción activa
      });

    // Suscripción adicional a canal de broadcast (posiciones en vivo sin escritura)
    if (this.broadcastChannel) {
      try { await this.supabaseSvc.supabase.removeChannel(this.broadcastChannel); } catch {}
      this.broadcastChannel = null;
    }
    this.broadcastChannel = this.supabaseSvc.supabase
      .channel('positions-broadcast')
      .on('broadcast', { event: 'pos' }, (msg: any) => {
        try {
          const payload = msg?.payload || {};
          const recId: string = payload.recorrido_id || payload.ruta_id;
          const lat: number = payload.lat;
          const lng: number = payload.lng;
          if (typeof lat === 'number' && typeof lng === 'number' && recId && this.map) {
            // Cliente: no pintar, solo seguir (pan)
            (this.map as L.Map).panTo([lat, lng], { animate: true });
          }
        } catch {}
      })
      .subscribe((status: any) => {
        // no-op
      });

    // Suscribirse a eventos de recorridos (start/finish) para mostrar/ocultar marcadores
    const recChan = this.supabaseSvc.getChannel('recorridos');
    recChan?.on('broadcast', { event: 'recorrido' }, async (msg: any) => {
      try {
        const action = msg?.payload?.action;
        const data = msg?.payload?.recorrido || {};
        if (action === 'finish') {
          const id = msg?.payload?.recorridoId || data?.id;
          if (id) this.removeClientLayers(id);
        } else if (action === 'start') {
          const r: any = data;
          if (r?.id) {
            const posiciones = await this.mapData.listarPosiciones(r.id);
            if (Array.isArray(posiciones) && posiciones.length) {
              this.drawClientPolyline(r.id, posiciones.map(p => L.latLng(p.lat, p.lng)));
              const last = posiciones[posiciones.length - 1];
              this.drawClientMarker(r.id, last.lat, last.lng);
            }
          }
        }
      } catch {}
    })?.subscribe?.(() => {});
  }

  private drawClientMarker(recId: string, lat: number, lng: number) {
    if (!this.map) return;
    const ll: L.LatLngExpression = [lat, lng];
    const existing = this.clientMarkers[recId];
    if (existing) {
      existing.setLatLng(ll);
    } else {
      const m = L.marker(ll, { title: `Recorrido ${recId}`, icon: this.vehicleIcon ?? undefined }).addTo(this.map as L.Map);
      this.clientMarkers[recId] = m;
    }
  }

  private colorFor(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 85%, 50%)`;
  }

  private drawClientPolyline(recId: string, pts: L.LatLng[]) {
    if (!this.map || !pts || pts.length === 0) return;
    const existing = this.clientPolylines[recId];
    if (existing) {
      existing.setLatLngs(pts);
    } else {
      const pl = L.polyline(pts, { color: this.colorFor(recId), weight: 4, opacity: 0.9 }).addTo(this.map as L.Map);
      this.clientPolylines[recId] = pl;
    }
  }

  private appendClientPolyline(recId: string, p: L.LatLng) {
    if (!this.map) return;
    const pl = this.clientPolylines[recId];
    if (pl) {
      const arr = (pl.getLatLngs() as L.LatLng[]);
      arr.push(p);
      pl.setLatLngs(arr);
    } else {
      this.drawClientPolyline(recId, [p]);
    }
  }

  private animateClientMarker(recId: string, from: L.LatLng, to: L.LatLng, durationMs: number) {
    if (!this.map) return;
    const marker = this.clientMarkers[recId];
    if (!marker) {
      this.drawClientMarker(recId, to.lat, to.lng);
      return;
    }
    // Cancel previous animation
    const existing = this.clientAnim[recId];
    if (existing?.raf) cancelAnimationFrame(existing.raf);
    const start = performance.now();
    const duration = Math.max(300, durationMs || 1000);
    const animate = (t: number) => {
      const el = this.clientAnim[recId];
      if (el && el.raf === null) return; // cancelled
      const dt = Math.min(1, (t - start) / duration);
      const lat = from.lat + (to.lat - from.lat) * dt;
      const lng = from.lng + (to.lng - from.lng) * dt;
      marker.setLatLng([lat, lng]);
      if (dt < 1) {
        this.clientAnim[recId].raf = requestAnimationFrame(animate);
      } else {
        this.clientAnim[recId].raf = null;
      }
    };
    this.clientAnim[recId] = { from, to, start, duration, raf: requestAnimationFrame(animate) };
  }

  private estimateClientDurationMs(prev: { ts?: string; created_at?: string }, last: { ts?: string; created_at?: string }): number {
    const a = (prev?.ts || prev?.created_at) ? new Date(prev.ts || prev.created_at as any).getTime() : 0;
    const b = (last?.ts || last?.created_at) ? new Date(last.ts || last.created_at as any).getTime() : 0;
    const d = b > a ? b - a : this.MIN_SUPA_POS_MS;
    return Math.max(300, Math.min(8000, d - 200));
  }

  private initMap(): void {
    // Create map
    this.map = L.map('mapa-map').setView([3.8833, -77.0167], 12);

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);

 

    // Prepare vehicle icon
    try {
      this.vehicleIcon = L.icon({
        iconUrl: 'assets/marker-icon.png',
        iconRetinaUrl: 'assets/marker-icon-2x.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        shadowUrl: undefined
      });
    } catch {}
  }

  // Ionic lifecycle hook, called when the page has fully entered and is now the active page
  ionViewDidEnter() {
    if (!this.map) {
      this.initMap();
    }
    this.map?.invalidateSize();
    setTimeout(() => this.map?.invalidateSize(), 200);
  }

  private onResize = () => {
    this.map?.invalidateSize();
  };

  ngOnDestroy() {
    window.removeEventListener('resize', this.onResize);
    if (this.posicionesTimer) {
      clearInterval(this.posicionesTimer);
    }
    if (this.clientWatchTimer) {
      clearInterval(this.clientWatchTimer);
      this.clientWatchTimer = null;
    }
    if (this.realtimeChannel) {
      try { this.supabaseSvc.supabase.removeChannel(this.realtimeChannel); } catch {}
      this.realtimeChannel = null;
    }
    if (this.broadcastChannel) {
      try { this.supabaseSvc.supabase.removeChannel(this.broadcastChannel); } catch {}
      this.broadcastChannel = null;
    }
    if (this.map && this.onMapClick) {
      this.map.off('click', this.onMapClick as any);
    }
    this.clearDraft();
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
    if (this.simPolyline && this.map) {
      (this.map as L.Map).removeLayer(this.simPolyline);
      this.simPolyline = null;
    }
    if (this.simMarker && this.map) {
      (this.map as L.Map).removeLayer(this.simMarker);
      this.simMarker = null;
    }
    if (this.watchId !== null) {
      navigator.geolocation?.clearWatch?.(this.watchId);
      this.watchId = null;
    }
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  private async loadUserRole() {
    try {
      const user = await this.supabaseSvc.getCurrentUser();
      if (!user) {
        this.userRole.set('cliente');
        return;
      }
      const prof = await this.supabaseSvc.getProfile(user.id);
      const data: any = (prof as any)?.data;
      const role = data?.role || data?.rol || 'cliente';
      if (role === 'admin' || role === 'conductor' || role === 'cliente') {
        this.userRole.set(role);
      } else {
        this.userRole.set('cliente');
      }
      // Por defecto, el conductor usa ubicación real
      if (this.userRole() === 'conductor') this.realTracking.set(true);
    } catch {
      this.userRole.set('cliente');
    }
  }

  private async loadCallesLayer() {
    const items = await this.mapData.loadCalles();
    if (!this.map) return;

    try {
      const features: GeoJSON.Feature<GeoJSON.LineString, any>[] = items
        .map(item => {
          try {
            const geom = JSON.parse(item.shape) as GeoJSON.LineString;
            if (geom.type !== 'LineString') return null;
            return {
              type: 'Feature',
              geometry: geom,
              properties: { id: item.id, nombre: item.nombre }
            } as GeoJSON.Feature<GeoJSON.LineString>;
          } catch {
            return null;
          }
        })
        .filter((f): f is GeoJSON.Feature<GeoJSON.LineString> => !!f);

      const fc: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
        type: 'FeatureCollection',
        features
      };

      if (this.callesLayer) {
        this.map.removeLayer(this.callesLayer);
        this.callesLayer = null;
      }

      this.callesLayer = L.geoJSON(fc, {
        style: () => ({ color: '#2196f3', weight: 2, opacity: 0.8 })
      }).addTo(this.map);

      // Toggle visibility according to signal
      if (!this.showCalles()) {
        this.map.removeLayer(this.callesLayer);
      }
    } catch (e) {
      // Silently ignore drawing errors
      // console.error(e);
    }
  }

  onToggleCalles(ev: CustomEvent) {
    const value = (ev.detail as any)?.checked ?? true;
    this.showCalles.set(value);
    if (this.callesLayer && this.map) {
      if (value) {
        this.callesLayer.addTo(this.map);
      } else {
        this.map.removeLayer(this.callesLayer);
      }
    }
  }

  // Rutas
  private async loadRutasLayer() {
    const rutas = await this.mapData.loadRutas();
    this.rutas.set(rutas);
    if (!this.map) return;

    const features: GeoJSON.Feature<GeoJSON.LineString, any>[] = rutas
      .map(r => {
        if (!r.shape) return null;
        try {
          const geom = JSON.parse(r.shape) as GeoJSON.LineString;
          if (geom.type !== 'LineString') return null;
          return {
            type: 'Feature',
            geometry: geom,
            properties: { id: r.id, nombre: r.nombre }
          } as GeoJSON.Feature<GeoJSON.LineString>;
        } catch {
          return null;
        }
      })
      .filter((f): f is GeoJSON.Feature<GeoJSON.LineString> => !!f);

    // If there are no geometries, skip drawing
    if (features.length === 0) return;

    const fc: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
      type: 'FeatureCollection',
      features
    };

    if (this.rutasLayer) {
      this.map.removeLayer(this.rutasLayer);
      this.rutasLayer = null;
    }

    this.rutasLayer = L.geoJSON(fc, {
      style: () => ({ color: '#2196f3', weight: 3, opacity: 0.9 })
    }).addTo(this.map);

    if (!this.showRutas()) {
      this.map.removeLayer(this.rutasLayer);
    }
  }

  onToggleRutas(ev: CustomEvent) {
    const value = (ev.detail as any)?.checked ?? true;
    this.showRutas.set(value);
    if (this.rutasLayer && this.map) {
      if (value) {
        this.rutasLayer.addTo(this.map);
      } else {
        this.map.removeLayer(this.rutasLayer);
      }
    }
  }

  toggleEditing() {
    if (this.userRole() !== 'admin') return;
    const next = !this.editing();
    this.editing.set(next);
    if (!next) this.editingSelected.set(false);
    if (!this.map) return;
    if (next) {
      this.map.on('click', this.onMapClick as any);
    } else {
      this.map.off('click', this.onMapClick as any);
    }
  }

  private onMapClick = (e: L.LeafletMouseEvent) => {
    if (!this.map || !this.editing()) return;
    this.draftPoints.push(e.latlng);
    if (this.draftPolyline) {
      this.draftPolyline.setLatLngs(this.draftPoints);
    } else {
      this.draftPolyline = L.polyline(this.draftPoints, { color: '#1409a7ff', weight: 3 }).addTo(this.map);
    }
    const m = L.marker(e.latlng, { title: `Punto ${this.draftPoints.length}` });
    m.addTo(this.map as L.Map);
    this.draftMarkers.push(m);
  };

  undoLast() {
    if (!this.map || this.draftPoints.length === 0) return;
    const lastMarker = this.draftMarkers.pop();
    if (lastMarker) {
      (this.map as L.Map).removeLayer(lastMarker);
    }
    this.draftPoints.pop();
    if (this.draftPolyline) {
      this.draftPolyline.setLatLngs(this.draftPoints);
      if (this.draftPoints.length === 0) {
        (this.map as L.Map).removeLayer(this.draftPolyline);
        this.draftPolyline = null;
      }
    }
  }

  clearDraft() {
    if (this.map) {
      for (const m of this.draftMarkers) {
        (this.map as L.Map).removeLayer(m);
      }
      if (this.draftPolyline) {
        (this.map as L.Map).removeLayer(this.draftPolyline);
      }
    }
    this.draftMarkers = [];
    this.draftPoints = [];
    this.draftPolyline = null;
  }

  draftCount(): number {
    return this.draftPoints.length;
  }

  async saveDraftAsRuta() {
    if (this.userRole() !== 'admin') return;
    if (this.draftPoints.length < 2) return;
    const coords: [number, number][] = this.draftPoints.map(p => [p.lng, p.lat]);
    const shape: GeoJSON.LineString = { type: 'LineString', coordinates: coords } as any;
    const calles = this.mapData.calles();
    const callesIds = (calles || []).slice(0, 10).map(c => c.id);
    const nombre = prompt('Nombre de la ruta:') || `Ruta ${new Date().toLocaleString()}`;
    const descripcion = '';
    const created = await this.mapData.createRuta({ nombre, descripcion, shape, callesIds });
    if (created) {
      await this.loadRutasLayer();
      this.selectedRutaId.set(created.id);
      this.clearDraft();
      if (this.editing()) this.toggleEditing();
    }
  }

  async startEditSelectedRuta() {
    if (this.userRole() !== 'admin') return;
    const id = this.selectedRutaId();
    if (!id) return;
    const rutas = this.rutas();
    const r = (rutas || []).find(x => x.id === id);
    if (!r || !r.shape) return;
    try {
      const geom = JSON.parse(r.shape) as GeoJSON.LineString;
      if (geom.type !== 'LineString') return;
      this.clearDraft();
      // cargar puntos existentes a draft
      this.draftPoints = (geom.coordinates || []).map(([lng, lat]) => L.latLng(lat, lng));
      if (this.map) {
        this.draftPolyline = L.polyline(this.draftPoints, { color: '#e91e63', weight: 3 }).addTo(this.map as L.Map);
        this.draftMarkers = this.draftPoints.map((pt, idx) => L.marker(pt, { title: `Punto ${idx + 1}` }).addTo(this.map as L.Map));
        const bounds = this.draftPolyline.getBounds();
        (this.map as L.Map).fitBounds(bounds.pad(0.2));
      }
      if (!this.editing()) this.toggleEditing();
      this.editingSelected.set(true);
    } catch {}
  }

  async saveEditedRuta() {
    if (this.userRole() !== 'admin') return;
    if (!this.editingSelected()) return;
    const id = this.selectedRutaId();
    if (!id) return;
    if (this.draftPoints.length < 2) return;
    const coords: [number, number][] = this.draftPoints.map(p => [p.lng, p.lat]);
    const shape: GeoJSON.LineString = { type: 'LineString', coordinates: coords } as any;
    const updated = await this.mapData.updateRuta(id, { shape });
    if (updated) {
      await this.loadRutasLayer();
      this.highlightSelectedRuta(id);
      this.clearDraft();
      this.editingSelected.set(false);
      if (this.editing()) this.toggleEditing();
    }
  }

  cancelEditRuta() {
    if (!this.editingSelected()) return;
    this.clearDraft();
    this.editingSelected.set(false);
    if (this.editing()) this.toggleEditing();
  }

  async saveDraftAsCalle() {
    if (this.userRole() !== 'admin') return;
    if (this.draftPoints.length < 2) return;
    const coords: [number, number][] = this.draftPoints.map(p => [p.lng, p.lat]);
    const shape: GeoJSON.LineString = { type: 'LineString', coordinates: coords } as any;
    const nombre = prompt('Nombre de la calle:') || `Calle ${new Date().toLocaleString()}`;
    const created = await this.mapData.createCalle({ nombre, shape });
    if (created) {
      await this.loadCallesLayer();
      this.clearDraft();
      if (this.editing()) this.toggleEditing();
    }
  }

  async createExampleRuta() {
    // Coordenadas simples alrededor del centro de Buenaventura
    const coords: [number, number][] = [
      [-77.0167, 3.8833],
      [-77.0125, 3.8860],
      [-77.0080, 3.8885]
    ];
    const shape: GeoJSON.LineString = { type: 'LineString', coordinates: coords } as any;
    // Tomar algunas calles existentes para cumplir con la validación del backend
    const calles = this.mapData.calles();
    if (!calles || calles.length === 0) {
      console.warn('[MapaPage] No hay calles cargadas; intentando crear ruta sin calles podría fallar.');
    }
    const callesIds = (calles || []).slice(0, 5).map(c => c.id);
    console.log('[MapaPage] Creando ruta de ejemplo...');
    const created = await this.mapData.createRuta({
      nombre: 'Ruta Ejemplo Buenaventura',
      descripcion: 'Creada desde la app para pruebas',
      shape,
      callesIds
    });
    if (created) {
      console.log('[MapaPage] Ruta creada con id:', created.id);
      await this.loadRutasLayer();
      this.selectedRutaId.set(created.id);
    }
  }

  async onStartRecorrido() {
    if (this.userRole() !== 'conductor') return;
    const rutaId = this.selectedRutaId();
    if (!rutaId) return;
    // Seleccionar vehículo requerido por la API externa
    let vehiculoId: string | null = null;
    try {
      const vehiculos = await this.api.getVehiculos();
      if (Array.isArray(vehiculos) && vehiculos.length > 0) {
        const first = vehiculos[0];
        const alert = await this.alertCtrl.create({
          header: 'Selecciona tu vehículo',
          inputs: vehiculos.map((v: Vehiculo) => ({
            name: 'veh',
            type: 'radio',
            label: `${v.placa}${v.modelo ? ' · ' + v.modelo : ''}`,
            value: v.id,
            checked: v.id === first.id
          })),
          buttons: [
            { text: 'Cancelar', role: 'cancel' },
            { text: 'Aceptar', role: 'confirm' }
          ]
        });
        await alert.present();
        const res = await alert.onDidDismiss();
        if (res.role !== 'confirm') return;
        vehiculoId = (res.data as any)?.values ?? (res.data as any)?.value ?? first.id;
      }
    } catch {}
    const rec = await this.mapData.iniciarRecorrido(rutaId, vehiculoId || undefined);
    if (rec) {
      this.activeRecorrido.set(rec);
      this.beginPollingPosiciones(rec.id);
      if (this.realTracking()) this.startRealTracking(); else this.startSimulation();
    } else {
      const local: RecorridoApiItem = {
        id: `local-${rutaId}-${Date.now()}`,
        ruta_id: rutaId,
        perfil_id: 'local',
        estado: 'en_progreso',
        iniciado_en: new Date().toISOString()
      } as any;
      this.activeRecorrido.set(local);
      this.beginPollingPosiciones(local.id);
      this.beginPromoteLocalRecorrido(local);
      if (this.realTracking()) this.startRealTracking(); else this.startSimulation();
    }
  }

  async onFinishRecorrido() {
    if (this.userRole() !== 'conductor') return;
    const rec = this.activeRecorrido();
    if (!rec) return;
    try {
      const list = await this.mapData.loadRecorridos();
      const isRunning = (s: string) => {
        const t = (s || '').toLowerCase().replace(/[_-]/g, ' ').trim();
        return t.includes('progreso') || t.includes('curso');
      };
      const runningByRuta = (list || []).find(r => isRunning(r.estado || '') && (!!rec.ruta_id ? r.ruta_id === rec.ruta_id : true));
      const anyRunning = runningByRuta || (list || []).find(r => isRunning(r.estado || ''));
      let targetId: string | null = null;
      if (rec.id && !rec.id.startsWith('local-')) {
        targetId = rec.id;
      } else if (anyRunning?.id) {
        targetId = anyRunning.id;
      }
      if (!targetId) return;
      const ok = await this.mapData.finalizarRecorrido(targetId);
      if (ok) {
        // Confirm by reloading list
        await this.mapData.loadRecorridos();
        this.activeRecorrido.set(null);
        if (this.posicionesTimer) clearInterval(this.posicionesTimer);
        if (this.promoteTimer) clearInterval(this.promoteTimer);
        if (this.simTimer) { clearInterval(this.simTimer); this.simTimer = null; }
        if (this.simPolyline && this.map) { (this.map as L.Map).removeLayer(this.simPolyline); this.simPolyline = null; }
        if (this.simMarker && this.map) { (this.map as L.Map).removeLayer(this.simMarker); this.simMarker = null; }
        if (this.watchId !== null) { navigator.geolocation?.clearWatch?.(this.watchId); this.watchId = null; }
        // Limpiar posición persistida
        try { this.clearLastConductorPos(); } catch {}
      }
    } catch {}
  }

  private beginPromoteLocalRecorrido(local: RecorridoApiItem) {
    if (this.promoteTimer) clearInterval(this.promoteTimer);
    const rutaId = local.ruta_id;
    const tryPromote = async () => {
      const list = await this.mapData.loadRecorridos();
      const real = (list || []).find(r => r.estado === 'en_progreso' && r.ruta_id === rutaId);
      if (real) {
        this.activeRecorrido.set(real);
        if (this.promoteTimer) clearInterval(this.promoteTimer);
        // Reinciar polling con id real
        this.beginPollingPosiciones(real.id);
      }
    };
    // Intentos por ~30s
    let attempts = 0;
    this.promoteTimer = setInterval(async () => {
      attempts++;
      if (attempts > 15) {
        clearInterval(this.promoteTimer);
        return;
      }
      await tryPromote();
    }, 2000);
  }

  private beginPollingPosiciones(recorridoId: string) {
    if (this.posicionesTimer) clearInterval(this.posicionesTimer);
    const poll = async () => {
      const posiciones = await this.mapData.listarPosiciones(recorridoId);
      this.drawRecorrido(posiciones);
    };
    poll();
    this.posicionesTimer = setInterval(poll, 5000);
  }

  private startSimulation() {
    if (this.simTimer) return;
    const rutaId = this.selectedRutaId();
    const coords = this.routeCoords;
    if (!rutaId || !coords || coords.length < 2) return;
    // Densificar ruta para pasos cortos (~5m) y evitar saltos
    this.simPath = this.densifyRoute(coords, 5);
    if (!this.simPath || this.simPath.length < 2) return;
    // Resume from nearest point to last persisted position if available
    const restored = this.restoreLastConductorPos();
    if (restored) {
      this.simIndex = this.findNearestIndexOnPath(restored.lat, restored.lng, this.simPath);
    } else {
      this.simIndex = 0;
    }
    const stepMs = 250;
    // Reset progress polyline and marker
    if (this.simPolyline && this.map) { (this.map as L.Map).removeLayer(this.simPolyline); }
    this.simPolyline = L.polyline([], { color: '#2ecc71', weight: 4, opacity: 0.9 }).addTo(this.map as L.Map);
    if (this.simMarker && this.map) { (this.map as L.Map).removeLayer(this.simMarker); }
    this.simMarker = null;
    this.simTimer = setInterval(async () => {
      const rec = this.activeRecorrido();
      if (!rec) { clearInterval(this.simTimer); this.simTimer = null; return; }
      const pt = this.simPath[this.simIndex];
      if (!pt) { clearInterval(this.simTimer); this.simTimer = null; return; }
      const recId = rec.id;
      const lat = pt.lat;
      const lng = pt.lng;
      const now = Date.now();
      if (recId && !recId.startsWith('local-') && (now - this.lastApiPosAtMs) >= this.MIN_API_POS_MS) {
        this.lastApiPosAtMs = now;
        await this.mapData.registrarPosicion(recId, lat, lng, 5);
      }
      if ((now - this.lastSupaPosAtMs) >= this.MIN_SUPA_POS_MS) {
        this.lastSupaPosAtMs = now;
        try { await this.supabaseSvc.createUbicacion({ recorrido_id: recId, ruta_id: rutaId, lat, lng, velocidad: 5 }); } catch {}
      }
      // Update progress polyline
      if (this.simPolyline) {
        const pts = (this.simPolyline.getLatLngs() as L.LatLng[]);
        pts.push(L.latLng(lat, lng));
        this.simPolyline.setLatLngs(pts);
      }
      // Update moving vehicle marker
      const ll: L.LatLngExpression = [lat, lng];
      if (this.simMarker) {
        this.simMarker.setLatLng(ll);
      } else {
        this.simMarker = L.marker(ll, { title: 'Vehículo', icon: this.vehicleIcon ?? undefined }).addTo(this.map as L.Map);
      }
      // Keep view following the vehicle softly
      const z = Math.max((this.map as L.Map).getZoom(), 14);
      (this.map as L.Map).panTo(ll, { animate: true });
      this.simIndex++;
      // Persistir última posición para restauración
      try { this.persistLastConductorPos(recId, lat, lng); } catch {}
      if (this.simIndex >= this.simPath.length) {
        clearInterval(this.simTimer);
        this.simTimer = null;
        // Preguntar cómo finalizar al llegar al final de la ruta
        await this.maybePromptFinish();
      }
    }, stepMs);
  }

  // Densifica una polilínea en pasos de longitud máxima maxStepMeters (aprox.)
  private densifyRoute(input: L.LatLng[], maxStepMeters: number): L.LatLng[] {
    if (!input || input.length < 2) return input || [];
    const out: L.LatLng[] = [];
    for (let i = 0; i < input.length - 1; i++) {
      const a = input[i];
      const b = input[i + 1];
      out.push(a);
      const dist = a.distanceTo(b);
      if (dist > maxStepMeters) {
        const steps = Math.floor(dist / maxStepMeters);
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          const lat = a.lat + (b.lat - a.lat) * t;
          const lng = a.lng + (b.lng - a.lng) * t;
          out.push(L.latLng(lat, lng));
        }
      }
    }
    out.push(input[input.length - 1]);
    return out;
  }

  private drawRecorrido(posiciones: PosicionApiItem[]) {
    if (!this.map) return;
    const latlngs = posiciones.map(p => [p.lat, p.lng] as [number, number]);

    if (this.recorridoPolyline) {
      this.recorridoPolyline.setLatLngs(latlngs);
    } else {
      this.recorridoPolyline = L.polyline(latlngs, { color: '#4caf50', weight: 4 }).addTo(this.map);
    }

    const last = posiciones[posiciones.length - 1];
    if (last) {
      const latlng: L.LatLngExpression = [last.lat, last.lng];
      if (this.recorridoMarker) {
        this.recorridoMarker.setLatLng(latlng);
      } else {
        this.recorridoMarker = L.marker(latlng, { title: 'Vehículo' }).addTo(this.map);
      }
      // Opcional: centrar suavemente
      this.map.setView(latlng, Math.max(this.map.getZoom(), 14));
    }
  }
}
