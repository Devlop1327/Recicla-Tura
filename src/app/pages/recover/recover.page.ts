import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-recover',
  templateUrl: './recover.page.html',
  styleUrls: ['./recover.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, RouterLink]
})
export class RecoverPage {
  email = signal('');
  isLoading = signal(false);

  constructor(
    private supabase: SupabaseService,
    private toast: ToastController,
    private router: Router
  ) {}

  async sendRecovery() {
    const emailVal = this.email().trim();
    if (!emailVal) {
      this.showToast('Ingresa tu email', 'warning');
      return;
    }
    this.isLoading.set(true);
    try {
      const { error } = await this.supabase.resetPasswordForEmail(emailVal);
      if (error) {
        this.showToast('Error: ' + error.message, 'danger');
      } else {
        this.showToast('Revisa tu correo para restablecer la contraseña', 'success');
        this.router.navigateByUrl('/login');
      }
    } catch (e) {
      this.showToast('Error inesperado', 'danger');
    } finally {
      this.isLoading.set(false);
    }
  }

  private async showToast(message: string, color: string) {
    const t = await this.toast.create({ message, duration: 3000, color, position: 'top' });
    await t.present();
  }
}
