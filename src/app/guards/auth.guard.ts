import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  
  constructor(
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  async canActivate(): Promise<boolean> {
    try {
      console.log('AuthGuard - Verificando autenticación...');
      const user = await this.supabaseService.getCurrentUser();
      console.log('AuthGuard - Usuario:', user);
      
      if (user) {
        console.log('AuthGuard - Usuario autenticado, permitiendo acceso');
        return true;
      } else {
        console.log('AuthGuard - No hay usuario, redirigiendo a login');
        // Redirigir al login cuando no haya sesión
        await this.router.navigate(['/login']);
        return false;
      }
    } catch (error) {
      console.error('AuthGuard - Error:', error);
      return false;
    }
  }
}
