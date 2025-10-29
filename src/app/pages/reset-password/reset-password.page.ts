import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController } from '@ionic/angular';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, IonicModule, ReactiveFormsModule],
  templateUrl: './reset-password.page.html',
  styleUrls: ['./reset-password.page.scss']
})
export class ResetPasswordPage implements OnInit, OnDestroy {
  loading = signal(false);
  canReset = signal(false);
  message = signal<string | null>(null);

  form = this.fb.group({
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirm: ['', [Validators.required]]
  });

  private unsub: (() => void) | null = null;

  constructor(
    private fb: FormBuilder,
    private supabase: SupabaseService,
    private router: Router,
    private toastCtrl: ToastController
  ) {}

  async ngOnInit() {
    // Detect recovery session via auth state change or existing session
    const { data: subData } = this.supabase.supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session && session.user)) {
        this.canReset.set(true);
      }
    });
    this.unsub = subData?.subscription ? () => subData.subscription.unsubscribe() : null;

    const { data } = await this.supabase.supabase.auth.getSession();
    if (data?.session?.user) {
      this.canReset.set(true);
    }
   
  }

  ngOnDestroy(): void {
    try { this.unsub && this.unsub(); } catch {}
  }

  async onSubmit() {
    if (this.loading()) return;
    if (this.form.invalid) {
      this.markAllAsTouched();
      return;
    }

    const { password, confirm } = this.form.value as any;
    if (password !== confirm) {
      this.message.set('Las contraseñas no coinciden');
      return;
    }

    try {
      this.loading.set(true);
      const { error } = await this.supabase.supabase.auth.updateUser({ password });
      if (error) throw error;

      const toast = await this.toastCtrl.create({
        message: 'Contraseña actualizada. Inicia sesión nuevamente.',
        duration: 2000,
        color: 'success'
      });
      await toast.present();
      await this.router.navigateByUrl('/login', { replaceUrl: true });
    } catch (e: any) {
      const toast = await this.toastCtrl.create({
        message: e?.message || 'No se pudo actualizar la contraseña.',
        duration: 2500,
        color: 'danger'
      });
      await toast.present();
    } finally {
      this.loading.set(false);
    }
  }

  private markAllAsTouched() {
    Object.values(this.form.controls).forEach(c => c.markAsTouched());
  }
}
