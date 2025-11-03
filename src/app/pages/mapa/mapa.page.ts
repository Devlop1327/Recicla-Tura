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
    // Give the DOM a tick to layout, then fix Leaflet sizing
    setTimeout(() => this.map?.invalidateSize(), 0);
    // Asegurar sizing en algunos dispositivos
    setTimeout(() => this.map?.invalidateSize(), 250);
    setTimeout(() => this.map?.invalidateSize(), 750);
    // Recompute size when viewport changes
    window.addEventListener('resize', this.onResize, { passive: true });
    // Load data layers
    this.loadCallesLayer();
    this.loadRutasLayer();
    // Cargar rol y luego iniciar observación para clientes
    this.loadUserRole().then(() => this.watchActiveRecorridosForClients());
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
        style: () => ({ color: '#e91e63', weight: 5, opacity: 1 })
      }).addTo(this.map as L.Map);
      this.selectedRutaLayer = layer;
      // Fallback visual con polyline explícita
      try {
        const pl = L.polyline(this.routeCoords, { color: '#e91e63', weight: 4, opacity: 0.9 });
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
      const pl = L.polyline(this.routeCoords, { color: '#e91e63', weight: 4, opacity: 0.9 }).addTo(this.map as L.Map);
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
  private async watchActiveRecorridosForClients() {
    const role = this.userRole();
    if (role === 'conductor') {
      // El conductor maneja su propio polling al iniciar recorrido
      if (this.clientWatchTimer) {
        clearInterval(this.clientWatchTimer);
        this.clientWatchTimer = null;
      }
      return;
    }
    const poll = async () => {
      try {
        const recs = await this.mapData.loadRecorridos();
        const activo = (recs || []).find(r => (r.estado || '').toLowerCase() === 'en_progreso');
        const recId = activo?.id || null;
        if (recId && recId !== this.lastWatchedRecorridoId) {
          this.lastWatchedRecorridoId = recId;
          const posiciones = await this.mapData.listarPosiciones(recId);
          this.drawRecorrido(posiciones);
        } else if (!recId) {
          // limpiar dibujo si no hay recorrido activo
          if (this.recorridoPolyline && this.map) {
            (this.map as L.Map).removeLayer(this.recorridoPolyline);
            this.recorridoPolyline = null;
          }
          if (this.recorridoMarker && this.map) {
            (this.map as L.Map).removeLayer(this.recorridoMarker);
            this.recorridoMarker = null;
          }
          this.lastWatchedRecorridoId = null;
        }
      } catch {}
    };
    await poll();
    if (this.clientWatchTimer) clearInterval(this.clientWatchTimer);
    this.clientWatchTimer = setInterval(poll, 5000);
  }

  private initMap(): void {
    // Create map
    this.map = L.map('map').setView([3.8833, -77.0167], 12);

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);

    // Add marker
    const marker = L.marker([3.8833, -77.0167]).addTo(this.map);
    marker.bindPopup('Buenaventura, Colombia').openPopup();
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
    if (this.map && this.onMapClick) {
      this.map.off('click', this.onMapClick as any);
    }
    this.clearDraft();
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
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
      style: () => ({ color: '#ff9800', weight: 3, opacity: 0.9 })
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
      this.draftPolyline = L.polyline(this.draftPoints, { color: '#e91e63', weight: 3 }).addTo(this.map);
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
      this.startSimulation();
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
      this.startSimulation();
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
    this.simIndex = 0;
    const stepMs = 1000;
    this.simTimer = setInterval(async () => {
      const rec = this.activeRecorrido();
      if (!rec) { clearInterval(this.simTimer); this.simTimer = null; return; }
      const pt = coords[this.simIndex];
      if (!pt) { clearInterval(this.simTimer); this.simTimer = null; return; }
      const recId = rec.id;
      const lat = pt.lat;
      const lng = pt.lng;
      if (recId && !recId.startsWith('local-')) {
        await this.mapData.registrarPosicion(recId, lat, lng, 5);
      }
      try {
        await this.supabaseSvc.createUbicacion({ recorrido_id: recId, ruta_id: rutaId, lat, lng, velocidad: 5 });
      } catch {}
      this.simIndex++;
      if (this.simIndex >= coords.length) {
        clearInterval(this.simTimer);
        this.simTimer = null;
      }
    }, stepMs);
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
