import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { SupabaseService } from '../../services/supabase.service';

interface Notificacion {
  id: string;
  user_id: string;
  titulo: string;
  mensaje: string;
  tipo: 'info' | 'warning' | 'success' | 'danger';
  leida: boolean;
  created_at: string;
  updated_at: string;
}

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.page.html',
  styleUrls: ['./notifications.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class NotificationsPage implements OnInit {
  notificaciones = signal<Notificacion[]>([]);
  isLoading = signal(true);
  filtro = signal<'todas' | 'no-leidas'>('todas');

  constructor(private supabaseService: SupabaseService) {}

  async ngOnInit() {
    await this.loadNotificaciones();
  }

  async loadNotificaciones() {
    this.isLoading.set(true);
    
    try {
      const user = await this.supabaseService.getCurrentUser();
      if (user) {
        const { data, error } = await this.supabaseService.getNotificaciones(user.id);
        
        if (error) {
          console.error('Error cargando notificaciones:', error);
        } else {
          this.notificaciones.set(data || []);
        }
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  getNotificacionesFiltradas(): Notificacion[] {
    const notificaciones = this.notificaciones();
    
    if (this.filtro() === 'no-leidas') {
      return notificaciones.filter(n => !n.leida);
    }
    
    return notificaciones;
  }

  async marcarComoLeida(notificacion: Notificacion) {
    try {
      const { error } = await this.supabaseService.updateNotificacion(notificacion.id, {
        leida: true,
        updated_at: new Date().toISOString()
      });

      if (!error) {
        // Actualizar localmente
        const notificaciones = this.notificaciones();
        const index = notificaciones.findIndex(n => n.id === notificacion.id);
        if (index >= 0) {
          notificaciones[index].leida = true;
          this.notificaciones.set([...notificaciones]);
        }
      }
    } catch (error) {
      console.error('Error marcando notificación como leída:', error);
    }
  }

  async marcarTodasComoLeidas() {
    try {
      const notificacionesNoLeidas = this.notificaciones().filter(n => !n.leida);
      
      for (const notificacion of notificacionesNoLeidas) {
        await this.marcarComoLeida(notificacion);
      }
    } catch (error) {
      console.error('Error marcando todas como leídas:', error);
    }
  }

  getIconoTipo(tipo: string): string {
    switch (tipo) {
      case 'info': return 'information-circle';
      case 'warning': return 'warning';
      case 'success': return 'checkmark-circle';
      case 'danger': return 'alert-circle';
      default: return 'notifications';
    }
  }

  getColorTipo(tipo: string): string {
    switch (tipo) {
      case 'info': return 'primary';
      case 'warning': return 'warning';
      case 'success': return 'success';
      case 'danger': return 'danger';
      default: return 'medium';
    }
  }

  formatFecha(fecha: string): string {
    const date = new Date(fecha);
    const ahora = new Date();
    const diffMs = ahora.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays}d`;
    
    return date.toLocaleDateString('es-CO');
  }

  getCantidadNoLeidas(): number {
    return this.notificaciones().filter(n => !n.leida).length;
  }

  onFiltroChange(event: any) {
    const value = event.detail.value;
    if (value === 'todas' || value === 'no-leidas') {
      this.filtro.set(value);
    }
  }
}
