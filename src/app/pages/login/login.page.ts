import { Component, signal, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { ToastController, LoadingController } from '@ionic/angular';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, ReactiveFormsModule, RouterLink]
})
export class LoginPage {
  email = signal('');
  password = signal('');
  isLoading = signal(false);
  isSignUp = signal(false);
  role = signal<'admin' | 'conductor' | 'cliente'>('cliente');
  form!: FormGroup;

  constructor(
    private supabaseService: SupabaseService,
    private router: Router,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder
  ) {}

  async ngOnInit(): Promise<void> {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
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
    const { email, password } = this.form.value;
    if (!email || !password) {
      this.showToast('Por favor completa todos los campos', 'warning');
      return;
    }

    this.isLoading.set(true);
    
    try {
      console.log('Intentando login con:', email);
      const { data, error } = await this.supabaseService.signInWithEmail(email, password);

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
    const { email, password } = this.form.value;
    if (!email || !password) {
      this.showToast('Por favor completa todos los campos', 'warning');
      return;
    }

    this.isLoading.set(true);
    
    try {
      const { data, error } = await this.supabaseService.signUpWithEmail(email, password);

      if (error) {
        this.showToast('Error al registrarse: ' + error.message, 'danger');
      } else {
        this.showToast('¡Registro exitoso! Revisa tu email para confirmar tu cuenta.', 'success');
        // Persistir el rol inmediatamente usando el id retornado por signUp (sin depender de sesión activa)
        try {
          const userId = data?.user?.id || data?.session?.user?.id;
          if (userId) {
            await this.supabaseService.ensureProfileWithRole(userId, this.role());
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
      // Redirigir a dashboards por rol
      const target = role === 'admin'
        ? '/admin/dashboard'
        : role === 'conductor'
          ? '/tabs/home'
          : '/tabs/home';
      console.log('Navegando según rol:', role, '=>', target);
      await this.router.navigateByUrl(target, { replaceUrl });
    } catch (err) {
      console.error('Error determinando rol/navegación, navegando por defecto:', err);
      await this.router.navigateByUrl('/mapa', { replaceUrl });
    }
  }
}
