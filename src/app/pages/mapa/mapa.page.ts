import { Component, AfterViewInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { HttpClientModule } from '@angular/common/http';
import * as L from 'leaflet';
import { MapDataService, RutaApiItem, RecorridoApiItem, PosicionApiItem } from '../../services/map-data.service';
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

  constructor(private mapData: MapDataService) { }

  ngAfterViewInit() {
    this.initMap();
    // Give the DOM a tick to layout, then fix Leaflet sizing
    setTimeout(() => this.map?.invalidateSize(), 0);
    // Recompute size when viewport changes
    window.addEventListener('resize', this.onResize, { passive: true });
    // Load data layers
    this.loadCallesLayer();
    this.loadRutasLayer();
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
    if (this.map) {
      this.map.remove();
      this.map = null;
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
    const rutaId = this.selectedRutaId();
    if (!rutaId) return;
    const rec = await this.mapData.iniciarRecorrido(rutaId);
    if (rec) {
      this.activeRecorrido.set(rec);
      this.beginPollingPosiciones(rec.id);
    }
  }

  async onFinishRecorrido() {
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
