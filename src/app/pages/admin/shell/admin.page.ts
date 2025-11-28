import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { SupabaseService } from '../../../services/supabase.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [IonicModule, CommonModule, RouterModule],
  templateUrl: './admin.page.html',
  styleUrls: ['./admin.page.scss']
})
export class AdminPage {
  constructor(private supabase: SupabaseService, private router: Router) {}

  role(): 'admin' | 'conductor' | 'cliente' | null {
    return this.supabase.currentRole?.() ?? null;
  }

  async logout() {
    try {
      await this.supabase.signOut();
    } finally {
      this.supabase.setCurrentRole(null);
      await this.router.navigateByUrl('/login');
    }
  }
}
