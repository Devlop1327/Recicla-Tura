import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { ToastController } from '@ionic/angular';
import { MessageService } from '../../services/message.service';
import { AvatarUploaderComponent } from '../../components/avatar-uploader/avatar-uploader.component';

interface Profile {
  id: string;
  email: string;
  full_name?: string;
  phone?: string;
  address?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, AvatarUploaderComponent]
})
export class ProfilePage implements OnInit {
  profile = signal<Profile | null>(null);
  isLoading = signal(true);
  isEditing = signal(false);
  
  // Formulario
  fullName = signal('');
  phone = signal('');
  address = signal('');

  // Cambio de contraseña en la misma pantalla
  showPwdForm = signal(false);
  pwdNew = signal('');
  pwdConfirm = signal('');

  // Estadísticas
  totalNotificaciones = signal(0);
  rutasSeguidas = signal(0);

  constructor(
    private supabaseService: SupabaseService,
    private router: Router,
    private toastController: ToastController,
    private messages: MessageService
  ) {}

  async ngOnInit() {
    await this.loadProfile();
    await this.loadStats();
  }

  async loadProfile() {
    this.isLoading.set(true);
    
    try {
      const user = await this.supabaseService.getCurrentUser();
      if (user) {
        const { data, error } = await this.supabaseService.getProfile(user.id);
        
        if (error) {
          console.error('Error cargando perfil:', error);
          this.showToast('Error cargando perfil', 'danger');
        } else {
          this.profile.set(data);
          this.fullName.set(data?.full_name || '');
          this.phone.set(data?.phone || '');
          this.address.set(data?.address || '');
        }
      }
    } catch (error) {
      console.error('Error:', error);
      this.showToast('Error inesperado', 'danger');
    } finally {
      this.isLoading.set(false);
    }
  }

  togglePwdForm() {
    const next = !this.showPwdForm();
    this.showPwdForm.set(next);
    if (!next) {
      this.pwdNew.set('');
      this.pwdConfirm.set('');
    }
  }

  private async loadStats() {
    try {
      const user = await this.supabaseService.getCurrentUser();
      if (!user) return;

      // Total de notificaciones del usuario
      try {
        const { data } = await this.supabaseService.getNotificaciones(user.id);
        const list = (data as any[]) || [];
        this.totalNotificaciones.set(list.length);
      } catch (e) {
        console.error('[ProfilePage] Error cargando estadísticas de notificaciones:', e);
      }

      // Rutas seguidas: contar rutas distintas en recorridos del perfil
      try {
        const { data } = await this.supabaseService.listRecorridos();
        const list = (data as any[]) || [];
        const mine = list.filter((r) => r.perfil_id === user.id);
        const rutas = new Set(
          mine
            .map((r) => r.ruta_id)
            .filter((id) => typeof id === 'string' && id?.length > 0)
        );
        this.rutasSeguidas.set(rutas.size);
      } catch (e) {
        console.error('[ProfilePage] Error cargando estadísticas de rutas seguidas:', e);
      }
    } catch (e) {
      console.error('[ProfilePage] Error general cargando estadísticas:', e);
    }
  }

  toggleEdit() {
    this.isEditing.set(!this.isEditing());
  }

  async saveProfile() {
    if (!this.profile()) return;

    try {
      const updates = {
        full_name: this.fullName(),
        phone: this.phone(),
        address: this.address(),
        updated_at: new Date().toISOString()
      };

      const { error } = await this.supabaseService.updateProfile(
        this.profile()!.id,
        updates
      );

      if (error) {
        this.showToast('Error actualizando perfil: ' + error.message, 'danger');
      } else {
        this.showToast('Perfil actualizado correctamente', 'success');
        this.isEditing.set(false);
        await this.loadProfile(); // Recargar datos
      }
    } catch (error) {
      this.showToast('Error inesperado', 'danger');
    }
  }

  async signOut() {
    try {
      await this.supabaseService.signOut();
      this.showToast('Sesión cerrada correctamente', 'success');
      this.router.navigate(['/login']);
    } catch (error) {
      this.showToast('Error cerrando sesión', 'danger');
    }
  }

  async changePassword() {
    try {
      const newPwd = (this.pwdNew() || '').trim();
      const confirm = (this.pwdConfirm() || '').trim();
      if (!newPwd || newPwd.length < 6) {
        await this.showToast('La contraseña debe tener al menos 6 caracteres', 'warning');
        return;
      }
      if (newPwd !== confirm) {
        await this.showToast('Las contraseñas no coinciden', 'warning');
        return;
      }
      this.isLoading.set(true);
      const { error } = await this.supabaseService.supabase.auth.updateUser({ password: newPwd });
      if (error) {
        await this.showToast('No se pudo cambiar la contraseña', 'danger');
        return;
      }
      await this.showToast('Contraseña actualizada', 'success');
      this.pwdNew.set('');
      this.pwdConfirm.set('');
    } catch (e) {
      await this.showToast('Error inesperado al cambiar contraseña', 'danger');
    } finally {
      this.isLoading.set(false);
    }
  }

  // Avatar upload
  selectedFile: File | null = null;
  async uploadAvatar() {
    if (!this.selectedFile || !this.profile()) {
      this.showToast('Selecciona una imagen primero', 'warning');
      return;
    }

    const userId = this.profile()!.id;
    const filename = `${Date.now()}_${this.selectedFile.name}`;
    const path = `${userId}/${filename}`; // dentro del bucket avatars

    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabaseService.uploadAvatar(path, this.selectedFile);
      if (error) {
        console.error('Error subiendo avatar:', error);
        const msg = (error as any)?.message ?? String(error);
        this.showToast('Error subiendo avatar: ' + msg, 'danger');
      } else {
        // Obtener URL pública
        const publicUrl = this.supabaseService.getPublicUrl(path);

        // Actualizar perfil con avatar_url
        const updates = { avatar_url: publicUrl, updated_at: new Date().toISOString() };
        const { error: updError } = await this.supabaseService.updateProfile(userId, updates);

        if (updError) {
          this.showToast('Error actualizando perfil con avatar: ' + updError.message, 'danger');
        } else {
          this.showToast('Avatar actualizado correctamente', 'success');
          await this.loadProfile();
          this.selectedFile = null;
        }
      }
    } catch (error) {
      console.error(error);
      this.showToast('Error inesperado al subir avatar', 'danger');
    } finally {
      this.isLoading.set(false);
    }
  }

  getFechaCreacion(): string {
    if (this.profile()?.created_at) {
      return new Date(this.profile()!.created_at).toLocaleDateString('es-CO');
    }
    return 'N/A';
  }

  getDiasActivo(): number {
    const created = this.profile()?.created_at;
    if (!created) return 0;
    const start = new Date(created);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return diffDays >= 0 ? diffDays + 1 : 0;
  }

  private async showToast(message: string, color: string) {
    await this.messages.toastMsg(message, color as any, 3000, 'top');
  }
}
