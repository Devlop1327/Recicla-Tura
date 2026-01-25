import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { ApiService, Ruta } from '../../services/api.service';
import { SupabaseService } from '../../services/supabase.service';

interface RutaHorario {
  id: string;
  ruta_id: string;
  dias_semana: string[];
  hora_inicio: string;
  hora_fin?: string | null;
  activo: boolean;
}

@Component({
  selector: 'app-rutas-horarios',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './rutas-horarios.page.html',
  styleUrls: ['./rutas-horarios.page.scss'],
})
export class RutasHorariosPage implements OnInit {
  rutas = signal<Ruta[]>([]);
  isLoading = signal<boolean>(false);
  selectedRuta = signal<Ruta | null>(null);
  horarios = signal<RutaHorario[]>([]);
  selectedDia = signal<string>('LUN');

  readonly dias = [
    { value: 'LUN', label: 'Lunes' },
    { value: 'MAR', label: 'Martes' },
    { value: 'MIE', label: 'Miércoles' },
    { value: 'JUE', label: 'Jueves' },
    { value: 'VIE', label: 'Viernes' },
    { value: 'SAB', label: 'Sábado' },
    { value: 'DOM', label: 'Domingo' },
  ];

  private readonly todayCode: string;
  readonly todayLabel: string;

  constructor(
    private api: ApiService,
    private router: Router,
    private supa: SupabaseService,
  ) {
    const jsDay = new Date().getDay(); // 0=Dom,1=Lun,...
    const codeMap = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
    this.todayCode = codeMap[jsDay] || 'LUN';
    const d = this.dias.find((x) => x.value === this.todayCode);
    this.todayLabel = d?.label || 'Hoy';
    this.selectedDia.set(this.todayCode);
  }

  async ngOnInit() {
    await Promise.all([this.loadRutas(), this.loadHorarios()]);
  }

  async loadRutas() {
    this.isLoading.set(true);
    try {
      const rs = await this.api.getRutas().catch(() => [] as Ruta[]);
      this.rutas.set(rs || []);
      if ((rs || []).length > 0) {
        this.selectedRuta.set((rs || [])[0]);
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  selectRuta(ruta: Ruta) {
    this.selectedRuta.set(ruta);
  }

  private async loadHorarios() {
    try {
      const { data } = await this.supa.listHorariosRuta();
      this.horarios.set((data || []) as RutaHorario[]);
    } catch {
      this.horarios.set([]);
    }
  }

  horariosDeRuta(rutaId: string | null | undefined): RutaHorario[] {
    if (!rutaId) return [];
    const dia = this.selectedDia();
    return (this.horarios() || []).filter(
      (h) =>
        h.ruta_id === rutaId &&
        h.activo !== false &&
        Array.isArray(h.dias_semana) &&
        h.dias_semana.includes(dia)
    );
  }

  labelDias(dias: string[]) {
    if (!Array.isArray(dias) || dias.length === 0) return 'Sin días';
    const map = new Map(this.dias.map((d) => [d.value, d.label] as const));
    return dias.map((d) => map.get(d) || d).join(', ');
  }

  formatHora12(hhmm: string | null | undefined) {
    if (!hhmm) return '';
    const [hStr, mStr] = hhmm.split(':');
    let h = parseInt(hStr || '0', 10);
    if (Number.isNaN(h)) return hhmm;
    const am = h < 12;
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    const hh = h.toString().padStart(2, '0');
    const suffix = am ? 'a. m.' : 'p. m.';
    return `${hh}:${mStr ?? '00'} ${suffix}`;
  }

  rutasParaDia(): Ruta[] {
    const dia = this.selectedDia();
    const all = this.rutas() || [];
    if (!dia) return all;
    const hasHorarioForDia = (rutaId: string) =>
      (this.horarios() || []).some(
        (h) =>
          h.ruta_id === rutaId &&
          h.activo !== false &&
          Array.isArray(h.dias_semana) &&
          h.dias_semana.includes(dia)
      );
    return all.filter((r) => hasHorarioForDia(r.id));
  }

  diaLabel(code: string): string {
    const d = this.dias.find((x) => x.value === code);
    return d?.label || code;
  }

  onDiaChange(ev: any) {
    const val = ev?.detail?.value as string;
    if (!val) return;
    this.selectedDia.set(val);
    // Si la ruta actual ya no tiene horario ese día, deseleccionarla
    const sel = this.selectedRuta();
    if (sel && this.horariosDeRuta(sel.id).length === 0) {
      const first = this.rutasParaDia()[0] ?? null;
      this.selectedRuta.set(first);
    }
  }

  async irAlMapaConRuta(ruta: Ruta) {
    if (!ruta?.id) return;
    await this.router.navigate(['/mapa'], { queryParams: { ruta: ruta.id } });
  }
}
