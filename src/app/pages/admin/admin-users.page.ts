import { Component, signal } from '@angular/core';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button autoHide="false" menu="admin-menu"></ion-menu-button>
        </ion-buttons>
        <ion-title>Usuarios</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="goTo('/admin/dashboard')" color="tertiary">
            <ion-icon slot="start" name="home"></ion-icon>
            Dashboard
          </ion-button>
          <ion-button (click)="createUser()" color="primary">
            <ion-icon slot="start" name="person-add"></ion-icon>
            Crear
          </ion-button>
          <ion-button (click)="invite()" color="medium">
            <ion-icon slot="start" name="person-add-outline"></ion-icon>
            Invitar
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-searchbar placeholder="Buscar por email, nombre o teléfono" (ionInput)="onSearch($event)" [debounce]=300></ion-searchbar>

      <ion-list inset>
        @for (u of users(); track u.id) {
          <ion-item-sliding>
            <ion-item>
              <ion-avatar slot="start">
                <ion-icon name="person-circle-outline" style="font-size:32px"></ion-icon>
              </ion-avatar>
              <ion-label>
                <h2>{{ u.full_name || u.email }}</h2>
                <p>{{ u.email }}</p>
                <ion-badge color="medium">{{ u.role || u.rol || 'cliente' }}</ion-badge>
              </ion-label>
              <ion-buttons slot="end">
                <ion-button fill="clear" color="medium" (click)="changeRole(u)">
                  <ion-icon name="shield-half-outline"></ion-icon>
                </ion-button>
                <ion-button fill="clear" color="danger" (click)="confirmDelete(u)">
                  <ion-icon name="trash-outline"></ion-icon>
                </ion-button>
              </ion-buttons>
            </ion-item>
            <ion-item-options side="start">
              <ion-item-option color="medium" (click)="changeRole(u)">
                <ion-icon slot="start" name="shield-half-outline"></ion-icon>
                Rol
              </ion-item-option>
            </ion-item-options>
            <ion-item-options side="end">
              <ion-item-option color="danger" (click)="confirmDelete(u)">
                <ion-icon slot="start" name="trash-outline"></ion-icon>
                Eliminar
              </ion-item-option>
            </ion-item-options>
          </ion-item-sliding>
        }
        @if (loading()) {
          <ion-item lines="none"><ion-label>Cargando...</ion-label></ion-item>
        }
        @if (!loading() && users().length === 0) {
          <ion-item lines="none"><ion-label>No hay usuarios</ion-label></ion-item>
        }
      </ion-list>
      <ion-infinite-scroll threshold="100px" (ionInfinite)="loadMore($event)" [disabled]="disableMore()">
        <ion-infinite-scroll-content loadingSpinner="bubbles" loadingText="Cargando más..."></ion-infinite-scroll-content>
      </ion-infinite-scroll>
      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button color="primary" (click)="createUser()" aria-label="Crear usuario">
          <ion-icon name="person-add"></ion-icon>
        </ion-fab-button>
      </ion-fab>
    </ion-content>
    <ion-footer>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button [disabled]="page() === 1" (click)="prevPage()">Anterior</ion-button>
        </ion-buttons>
        <ion-title size="small">Página {{ page() }} · {{ total() }} usuarios</ion-title>
        <ion-buttons slot="end">
          <ion-button [disabled]="page() >= maxPage()" (click)="nextPage()">Siguiente</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  `,
})
export class AdminUsersPage {
  users = signal<any[]>([]);
  total = signal(0);
  page = signal(1);
  pageSize = signal(20);
  q = signal('');
  loading = signal(false);
  // Invitación por magic link; el rol se asigna después de que el usuario ingrese

  constructor(
    private supabase: SupabaseService,
    private alerts: AlertController,
    private toast: ToastController,
    private router: Router
  ) {}

  async ionViewWillEnter() {
    await this.reload();
  }

  maxPage() {
    return Math.max(1, Math.ceil(this.total() / this.pageSize()));
  }

  disableMore() {
    return this.users().length >= this.total();
  }

  async reload() {
    this.loading.set(true);
    try {
      const offset = (this.page() - 1) * this.pageSize();
      const { data, error, count } = await this.supabase.listProfiles({ q: this.q(), limit: this.pageSize(), offset, orderBy: 'created_at', ascending: false });
      if (error) {
        await this.notify('Error cargando usuarios');
        return;
      }
      this.users.set(data || []);
      this.total.set(count || 0);
    } finally {
      this.loading.set(false);
    }
  }

  async loadMore(ev: CustomEvent) {
    try {
      if (this.disableMore()) {
        (ev.target as HTMLIonInfiniteScrollElement).complete();
        return;
      }
      const nextOffset = this.users().length;
      const { data, error } = await this.supabase.listProfiles({ q: this.q(), limit: this.pageSize(), offset: nextOffset, orderBy: 'created_at', ascending: false });
      if (!error && data?.length) {
        this.users.set([...this.users(), ...data]);
      }
    } finally {
      (ev.target as HTMLIonInfiniteScrollElement).complete();
    }
  }

  async onSearch(ev: any) {
    const value = ev?.target?.value || '';
    this.q.set(value);
    this.page.set(1);
    await this.reload();
  }

  async nextPage() {
    if (this.page() < this.maxPage()) {
      this.page.set(this.page() + 1);
      await this.reload();
    }
  }

  async prevPage() {
    if (this.page() > 1) {
      this.page.set(this.page() - 1);
      await this.reload();
    }
  }

  async goTo(path: string) {
    await this.router.navigateByUrl(path);
  }

  async createUser() {
    const alert = await this.alerts.create({
      header: 'Crear usuario',
      cssClass: 'create-user-alert',
      inputs: [
        { name: 'email', type: 'email', placeholder: 'email@dominio.com' },
        { name: 'password', type: 'password', placeholder: 'Contraseña (mín. 6)' },
        { type: 'radio', label: 'admin', value: 'admin' },
        { type: 'radio', label: 'conductor', value: 'conductor', checked: true },
        { type: 'radio', label: 'cliente', value: 'cliente' }
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Crear', role: 'confirm' }
      ]
    });
    await alert.present();
    const res = await alert.onDidDismiss();
    if (res.role !== 'confirm') return;
    const values = (res.data as any)?.values || (res.data as any);
    const email = (values?.email || '').trim();
    const password = (values?.password || '').trim();
    // Para alert con radios, Ionic retorna el valor seleccionado en res.data.values cuando no hay múltiples
    const roleCandidate = (res.data as any)?.values ?? (values as any);
    const role: 'admin' | 'conductor' | 'cliente' = ['admin','conductor','cliente'].includes(roleCandidate)
      ? roleCandidate
      : 'conductor';
    if (!email || !password) { await this.notify('Email y contraseña requeridos'); return; }
    if (password.length < 6) { await this.notify('La contraseña debe tener al menos 6 caracteres'); return; }

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.signUpWithEmail(email, password);
      if (error) { await this.notify('No se pudo crear el usuario: ' + error.message); return; }
      const userId = data?.user?.id || data?.session?.user?.id;
      if (userId) {
        await this.supabase.upsertProfile({ id: userId, email, role });
      }

      if (data?.session) {
        await this.notify('Usuario creado. Se cerrará tu sesión por seguridad. Inicia sesión nuevamente.');
        await this.supabase.signOut();
        return;
      }

      await this.notify('Usuario creado. Si la confirmación por email está activa, deberá confirmar su correo.');
      await this.reload();
    } finally {
      this.loading.set(false);
    }
  }

  async changeRole(u: any) {
    const alert = await this.alerts.create({
      header: 'Cambiar rol',
      inputs: [
        { type: 'radio', label: 'admin', value: 'admin', checked: (u.role || u.rol) === 'admin' },
        { type: 'radio', label: 'conductor', value: 'conductor', checked: (u.role || u.rol) === 'conductor' },
        { type: 'radio', label: 'cliente', value: 'cliente', checked: (u.role || u.rol) === 'cliente' }
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Guardar', role: 'confirm' }
      ]
    });
    await alert.present();
    const res = await alert.onDidDismiss();
    if (res.role !== 'confirm') return;
    const newRole = res.data?.values || res.data;
    const role = typeof newRole === 'string' ? newRole : (newRole?.[0] ?? (u.role || u.rol));
    const { error } = await this.supabase.updateProfileRole(u.id, role);
    if (error) {
      await this.notify('No se pudo actualizar el rol');
      return;
    }
    await this.notify('Rol actualizado');
    await this.reload();
  }

  async confirmDelete(u: any) {
    const alert = await this.alerts.create({
      header: 'Eliminar usuario',
      message: `¿Eliminar perfil de "${u.full_name || u.email}"?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive' }
      ]
    });
    await alert.present();
    const res = await alert.onDidDismiss();
    if (res.role !== 'destructive') return;
    const { error } = await this.supabase.deleteProfile(u.id);
    if (error) {
      await this.notify('No se pudo eliminar');
      return;
    }
    await this.notify('Usuario eliminado');
    await this.reload();
  }

  async invite() {
    const alert = await this.alerts.create({
      header: 'Invitar usuario',
      inputs: [
        { name: 'email', type: 'email', placeholder: 'email@dominio.com' }
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Enviar', role: 'confirm' }
      ]
    });
    await alert.present();
    const res = await alert.onDidDismiss();
    if (res.role !== 'confirm') return;
    const values = (res.data as any)?.values || (res.data as any);
    const email = (values?.email || '').trim();
    if (!email) { await this.notify('Email requerido'); return; }

    const { error } = await this.supabase.sendMagicLink(email);
    if (error) { await this.notify('No se pudo enviar el enlace'); return; }
    await this.notify('Enlace de acceso enviado. Asigna el rol después del primer ingreso.');
    await this.reload();
  }

  private async notify(message: string) {
    const t = await this.toast.create({ message, duration: 1500, position: 'top' });
    await t.present();
  }
}
