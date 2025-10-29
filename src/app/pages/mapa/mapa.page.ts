import { Component, AfterViewInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { HttpClientModule } from '@angular/common/http';
import * as L from 'leaflet';
import { MapDataService, RutaApiItem, RecorridoApiItem, PosicionApiItem } from '../../services/map-data.service';
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
  private recorridoPolyline: L.Polyline | null = null;
  private recorridoMarker: L.Marker | null = null;
  private posicionesTimer: any = null;
  showCalles = signal(true);
  showRutas = signal(true);
  rutas = signal<RutaApiItem[]>([]);
  selectedRutaId = signal<string | null>(null);
  activeRecorrido = signal<RecorridoApiItem | null>(null);
  readonly supportsRecorridos = environment.api.supportsRecorridos ?? false;
  userRole = signal<'admin' | 'conductor' | 'cliente' | null>(null);
  editing = signal(false);
  private draftPoints: L.LatLng[] = [];
  private draftMarkers: L.Marker[] = [];
  private draftPolyline: L.Polyline | null = null;

  constructor(private mapData: MapDataService, private supabaseSvc: SupabaseService) { }

  ngAfterViewInit() {
    this.initMap();
    // Give the DOM a tick to layout, then fix Leaflet sizing
    setTimeout(() => this.map?.invalidateSize(), 0);
    // Recompute size when viewport changes
    window.addEventListener('resize', this.onResize, { passive: true });
    // Load data layers
    this.loadCallesLayer();
    this.loadRutasLayer();
    this.loadUserRole();
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
    this.map?.invalidateSize();
  }

  private onResize = () => {
    this.map?.invalidateSize();
  };

  ngOnDestroy() {
    window.removeEventListener('resize', this.onResize);
    if (this.posicionesTimer) {
      clearInterval(this.posicionesTimer);
    }
    if (this.map && this.onMapClick) {
      this.map.off('click', this.onMapClick as any);
    }
    this.clearDraft();
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
    const rec = await this.mapData.iniciarRecorrido(rutaId);
    if (rec) {
      this.activeRecorrido.set(rec);
      this.beginPollingPosiciones(rec.id);
    }
  }

  async onFinishRecorrido() {
    if (this.userRole() !== 'conductor') return;
    const rec = this.activeRecorrido();
    if (!rec) return;
    const ok = await this.mapData.finalizarRecorrido(rec.id);
    if (ok) {
      this.activeRecorrido.set(null);
      if (this.posicionesTimer) clearInterval(this.posicionesTimer);
    }
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
