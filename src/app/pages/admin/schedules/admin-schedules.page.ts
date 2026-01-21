import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, AlertController } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { SupabaseService } from '@app/services/supabase.service';
import { MapDataService, RutaApiItem } from '@app/services/map-data.service';
import { MessageService } from '@app/services/message.service';
import { FormsModule } from '@angular/forms';

interface RutaHorario {
  id: string;
  ruta_id: string;
  dias_semana: string[];
  hora_inicio: string;
  hora_fin?: string | null;
  activo: boolean;
}

@Component({
  selector: 'app-admin-schedules',
  standalone: true,
  imports: [IonicModule, CommonModule, RouterModule, FormsModule],
  templateUrl: './admin-schedules.page.html'
})
export class AdminSchedulesPage {
  rutas = signal<RutaApiItem[]>([]);
  horarios = signal<RutaHorario[]>([]);

  // Estado del formulario en modal
  formOpen = signal(false);
  editing = signal<RutaHorario | null>(null);
  form = signal<{
    ruta_id: string;
    dias_semana: string[];
    hora_inicio: string;
    hora_fin: string | null;
  }>({ ruta_id: '', dias_semana: [], hora_inicio: '06:00', hora_fin: '08:00' });

  readonly dias = [
    { value: 'LUN', label: 'Lunes' },
    { value: 'MAR', label: 'Martes' },
    { value: 'MIE', label: 'Miércoles' },
    { value: 'JUE', label: 'Jueves' },
    { value: 'VIE', label: 'Viernes' },
    { value: 'SAB', label: 'Sábado' },
    { value: 'DOM', label: 'Domingo' }
  ];

  readonly horas = ['05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23'];
  readonly minutos = ['00','15','30','45'];

  constructor(
    private supa: SupabaseService,
    private mapData: MapDataService,
    private messages: MessageService,
    private alertCtrl: AlertController,
  ) {}

  async ionViewWillEnter() {
    await this.load();
  }

  private async load() {
    const rutas = await this.mapData.loadRutas();
    this.rutas.set(rutas || []);
    const { data } = await this.supa.listHorariosRuta();
    this.horarios.set((data || []) as RutaHorario[]);
  }

  async onRefresh(ev: CustomEvent) {
    try { await this.load(); } finally { (ev.target as HTMLIonRefresherElement)?.complete?.(); }
  }

  nombreRuta(id: string) {
    const r = (this.rutas() || []).find(x => x.id === id);
    return r?.nombre || r?.nombre_ruta || 'Ruta';
  }

  labelDias(dias: string[]) {
    if (!Array.isArray(dias) || dias.length === 0) return 'Sin días';
    const map = new Map(this.dias.map(d => [d.value, d.label] as const));
    return dias.map(d => map.get(d) || d).join(', ');
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

  horaInicioHora() {
    const v = this.form().hora_inicio || '06:00';
    return v.slice(0, 2);
  }

  horaInicioMinuto() {
    const v = this.form().hora_inicio || '06:00';
    return v.slice(3, 5);
  }

  horaFinHora() {
    const v = this.form().hora_fin || this.form().hora_inicio || '08:00';
    return v.slice(0, 2);
  }

  horaFinMinuto() {
    const v = this.form().hora_fin || this.form().hora_inicio || '08:00';
    return v.slice(3, 5);
  }

  async create() {
    const rutas = this.rutas() || [];
    this.editing.set(null);
    this.form.set({
      ruta_id: rutas[0]?.id ?? '',
      dias_semana: [],
      hora_inicio: '06:00',
      hora_fin: '08:00',
    });
    this.formOpen.set(true);
  }

  async edit(h: RutaHorario) {
    this.editing.set(h);
    this.form.set({
      ruta_id: h.ruta_id,
      dias_semana: [...(h.dias_semana || [])],
      hora_inicio: h.hora_inicio?.slice(0, 5) || '06:00',
      hora_fin: h.hora_fin ? h.hora_fin.slice(0, 5) : null,
    });
    this.formOpen.set(true);
  }

  closeForm() {
    this.formOpen.set(false);
  }

  async saveForm() {
    const value = this.form();
    const rutas = this.rutas() || [];
    const ruta_id = value.ruta_id || rutas[0]?.id;
    const dias_semana = value.dias_semana || [];
    const hora_inicio = value.hora_inicio;
    const hora_fin = value.hora_fin || null;

    if (!ruta_id || !hora_inicio || !Array.isArray(dias_semana) || dias_semana.length === 0) {
      await this.messages.toastMsg(
        'Ruta, días y hora de inicio son obligatorios',
        'warning',
        1500,
        'top'
      );
      return;
    }

    const existing = this.editing();

    if (existing) {
      const { error } = await this.supa.updateHorarioRuta(existing.id, {
        ruta_id,
        dias_semana,
        hora_inicio,
        hora_fin,
      });
      if (!error) {
        await this.messages.toastMsg('Horario actualizado', 'success', 1200, 'top');
        await this.load();
        this.closeForm();
      } else {
        await this.messages.toastMsg('No se pudo actualizar el horario', 'danger', 1500, 'top');
      }
    } else {
      const { error } = await this.supa.createHorarioRuta({
        ruta_id,
        dias_semana,
        hora_inicio,
        hora_fin,
      });
      if (!error) {
        await this.messages.toastMsg('Horario creado', 'success', 1200, 'top');
        await this.load();
        this.closeForm();
      } else {
        await this.messages.toastMsg('No se pudo crear el horario', 'danger', 1500, 'top');
      }
    }
  }

  async confirmDelete(h: RutaHorario) {
    const alert = await this.alertCtrl.create({
      header: 'Eliminar horario',
      message: `¿Eliminar horario de "${this.nombreRuta(h.ruta_id)}"?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive' },
      ],
    });
    await alert.present();
    const res = await alert.onDidDismiss();
    if (res.role !== 'destructive') return;

    const { error } = await this.supa.deleteHorarioRuta(h.id);
    if (!error) {
      await this.messages.toastMsg('Horario eliminado', 'success', 1200, 'top');
      await this.load();
    } else {
      await this.messages.toastMsg('No se pudo eliminar el horario', 'danger', 1500, 'top');
    }
  }

  updateForm(patch: Partial<{ ruta_id: string; dias_semana: string[]; hora_inicio: string; hora_fin: string | null }>) {
    this.form.set({ ...this.form(), ...patch });
  }

  onHoraInicioHoraChange(ev: CustomEvent) {
    const h = (ev as any).detail?.value as string;
    const m = this.horaInicioMinuto();
    if (h) this.updateForm({ hora_inicio: `${h}:${m}` });
  }

  onHoraInicioMinutoChange(ev: CustomEvent) {
    const m = (ev as any).detail?.value as string;
    const h = this.horaInicioHora();
    if (m) this.updateForm({ hora_inicio: `${h}:${m}` });
  }

  onHoraFinHoraChange(ev: CustomEvent) {
    const h = (ev as any).detail?.value as string;
    const m = this.horaFinMinuto();
    if (h) this.updateForm({ hora_fin: `${h}:${m}` });
  }

  onHoraFinMinutoChange(ev: CustomEvent) {
    const m = (ev as any).detail?.value as string;
    const h = this.horaFinHora();
    if (m) this.updateForm({ hora_fin: `${h}:${m}` });
  }
}
