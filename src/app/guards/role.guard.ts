import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

export const roleGuard: CanActivateFn = async (route, state) => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);

  const allowed = (route.data?.['roles'] as Array<'admin' | 'conductor' | 'cliente'> | undefined) ?? undefined;

  let role = supabase.currentRole();
  try {
    if (!role) {
      const user = await supabase.getCurrentUser();
      if (!user) {
        await router.navigateByUrl('/login');
        return false;
      }
      const prof = await supabase.getProfile(user.id);
      const data: any = (prof as any)?.data;
      const r = data?.role || data?.rol || 'cliente';
      if (r === 'admin' || r === 'conductor' || r === 'cliente') {
        role = r;
      } else {
        role = 'cliente';
      }
      supabase.setCurrentRole(role);
    }

    if (allowed && role && !allowed.includes(role)) {
      await router.navigateByUrl('/mapa');
      return false;
    }
    return true;
  } catch (e) {
    await router.navigateByUrl('/login');
    return false;
  }
};
