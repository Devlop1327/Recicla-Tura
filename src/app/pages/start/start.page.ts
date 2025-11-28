import { Component, OnInit, effect, inject } from '@angular/core';
import { IonicModule, IonSpinner } from '@ionic/angular';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-start',
  standalone: true,
  imports: [IonicModule, CommonModule],
  template: `
    <ion-content fullscreen>
      <ion-grid class="start-center">
        <ion-row class="ion-justify-content-center ion-align-items-center" style="height: 100%">
          <ion-col size="12" class="ion-text-center">
            <ion-spinner name="crescent"></ion-spinner>
          </ion-col>
        </ion-row>
      </ion-grid>
    </ion-content>
  `,
  styles: [`
    .start-center { height: 100%; }
  `]
})
export class StartPage implements OnInit {
  private supabase = inject(SupabaseService);
  private router = inject(Router);

  async ngOnInit() {
    try {
      const user = await this.supabase.getCurrentUser();
      if (!user) {
        await this.router.navigateByUrl('/login', { replaceUrl: true });
        return;
      }
      const prof = await this.supabase.getProfile(user.id);
      const data: any = (prof as any)?.data;
      const r = data?.role || data?.rol || 'cliente';
      const role: 'admin' | 'conductor' | 'cliente' =
        r === 'admin' || r === 'conductor' || r === 'cliente' ? r : 'cliente';
      this.supabase.setCurrentRole(role);

      const target = role === 'admin' ? '/admin/dashboard' : '/tabs/home';
      await this.router.navigateByUrl(target, { replaceUrl: true });
    } catch (e) {
      await this.router.navigateByUrl('/login', { replaceUrl: true });
    }
  }
}
