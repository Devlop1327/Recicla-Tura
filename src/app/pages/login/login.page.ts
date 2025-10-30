import { Component, signal, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { ToastController, LoadingController } from '@ionic/angular';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, RouterLink]
})
export class LoginPage {
  email = signal('');
  password = signal('');
  isLoading = signal(false);
  isSignUp = signal(false);
  role = signal<'admin' | 'conductor' | 'cliente'>('cliente');

  constructor(
    private supabaseService: SupabaseService,
    private router: Router,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    // Si ya hay un usuario autenticado, redirigir a la app principal
    try {
      this.isLoading.set(true);
      const user = await this.supabaseService.getCurrentUser();
      console.log('LoginPage ngOnInit - usuario actual:', user);
      if (user) {
        await this.setRoleFromProfileAndNavigate(true);
      }
    } catch (error) {
      console.error('Error comprobando sesión en ngOnInit:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  async login() {
    if (!this.email() || !this.password()) {
      this.showToast('Por favor completa todos los campos', 'warning');
      return;
    }

    this.isLoading.set(true);
    
    try {
      console.log('Intentando login con:', this.email());
      const { data, error } = await this.supabaseService.signInWithEmail(
        this.email(),
        this.password()
      );

      console.log('Resultado del login:', { data, error });

      if (error) {
        console.error('Error en login:', error);
        this.showToast('Error al iniciar sesión: ' + error.message, 'danger');
      } else {
        console.log('Login exitoso, redirigiendo...');
        this.showToast('¡Bienvenido a Recicla-Tura!', 'success');
        
        // Forzar detección de cambios
        this.cdr.detectChanges();
        
        await this.setRoleFromProfileAndNavigate(true);
      }
    } catch (error) {
      this.showToast('Error inesperado', 'danger');
    } finally {
      this.isLoading.set(false);
    }
  }

  async signUp() {
    if (!this.email() || !this.password()) {
      this.showToast('Por favor completa todos los campos', 'warning');
      return;
    }

    this.isLoading.set(true);
    
    try {
      const { data, error } = await this.supabaseService.signUpWithEmail(
        this.email(),
        this.password()
      );

      if (error) {
        this.showToast('Error al registrarse: ' + error.message, 'danger');
      } else {
        this.showToast('¡Registro exitoso! Revisa tu email para confirmar tu cuenta.', 'success');
        // Si hay sesión y un id de usuario, persistir el rol en profiles
        try {
          const user = await this.supabaseService.getCurrentUser();
          if (user?.id) {
            await this.supabaseService.ensureProfileWithRole(user.id, this.role());
            this.supabaseService.setCurrentRole(this.role());
          }
        } catch {}
        this.isSignUp.set(false);
      }
    } catch (error) {
      this.showToast('Error inesperado', 'danger');
    } finally {
      this.isLoading.set(false);
    }
  }

  toggleSignUp() {
    this.isSignUp.set(!this.isSignUp());
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color: color,
      position: 'top'
    });
    await toast.present();
  }

  private async setRoleFromProfileAndNavigate(replaceUrl = true) {
    try {
      const user = await this.supabaseService.getCurrentUser();
      let role: 'admin' | 'conductor' | 'cliente' = 'cliente';
      if (user) {
        const prof = await this.supabaseService.getProfile(user.id);
        const data: any = (prof as any)?.data;
        const r = data?.role || data?.rol || 'cliente';
        if (r === 'admin' || r === 'conductor' || r === 'cliente') {
          role = r;
        }
      }
      this.supabaseService.setCurrentRole(role);
      // Redirigir según rol
      const target = role === 'admin' ? '/admin' : (role === 'conductor' ? '/conductor/rutas' : '/mapa');
      console.log('Navegando según rol:', role, '=>', target);
      await this.router.navigateByUrl(target, { replaceUrl });
    } catch (err) {
      console.error('Error determinando rol/navegación, navegando por defecto:', err);
      await this.router.navigateByUrl('/mapa', { replaceUrl });
    }
  }
}
