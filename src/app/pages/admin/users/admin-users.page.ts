import { Component, signal } from '@angular/core';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../../services/supabase.service';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MessageService } from '@app/services/message.service';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './admin-users.page.html',
  styleUrls: ['./admin-users.page.scss']
})
export class AdminUsersPage {
  users = signal<any[]>([]);
  filterRole = signal<'all' | 'admin' | 'conductor' | 'cliente'>('all');
  total = signal(0);
  page = signal(1);
  pageSize = signal(20);
  q = signal('');
  loading = signal(false);

  constructor(
    private supabase: SupabaseService,
    private alerts: AlertController,
    private toast: ToastController,
    private router: Router,
    private messages: MessageService
  ) {}

  async ionViewWillEnter() { await this.reloadAll(); }

  maxPage() { return Math.max(1, Math.ceil(this.total() / this.pageSize())); }
  disableMore() { return this.users().length >= this.total(); }

  displayedUsers() {
    const role = this.filterRole();
    const list = this.users() || [];
    if (role === 'all') return list;
    return list.filter(u => (u.role || u.rol || 'cliente') === role);
  }

  onFilterRoleChange(ev: CustomEvent) {
    const val = (ev?.detail as any)?.value as string | undefined;
    const ok = (val === 'all' || val === 'admin' || val === 'conductor' || val === 'cliente') ? val : 'all';
    this.filterRole.set(ok);
  }

  roleBadgeColor(u: any): string {
    const r = (u?.role || u?.rol || 'cliente');
    switch (r) {
      case 'admin': return 'tertiary';
      case 'conductor': return 'success';
      default: return 'medium';
    }
  }

  async reload() {
    this.loading.set(true);
    try {
      const offset = (this.page() - 1) * this.pageSize();
      const { data, error, count } = await this.supabase.listProfiles({ q: this.q(), limit: this.pageSize(), offset, orderBy: 'created_at', ascending: false });
      if (error) return;
      this.users.set(data || []);
      this.total.set(count || 0);
    } finally { this.loading.set(false); }
  }

  // Cargar TODOS los usuarios al entrar (paginando en el backend)
  async reloadAll() {
    this.loading.set(true);
    try {
      const limit = 200; // lote grande para minimizar llamadas
      let offset = 0;
      let all: any[] = [];
      let expected = 0;
      // primera página para obtener el total
      const first = await this.supabase.listProfiles({ q: this.q(), limit, offset, orderBy: 'created_at', ascending: false });
      if (!first.error) {
        all = (first.data || []);
        expected = first.count || all.length;
      }
      offset = all.length;
      // seguir pidiendo hasta cubrir el total o no haya más
      while (offset < expected) {
        const { data, error } = await this.supabase.listProfiles({ q: this.q(), limit, offset, orderBy: 'created_at', ascending: false });
        if (error) break;
        const batch = data || [];
        if (!batch.length) break;
        all = all.concat(batch);
        offset += batch.length;
        if (batch.length < limit) break;
      }
      this.users.set(all);
      this.total.set(expected || all.length);
      // ajustar paginado para que coincida con la carga completa
      this.page.set(1);
      this.pageSize.set(all.length || limit);
    } finally {
      this.loading.set(false);
    }
  }

  async loadMore(ev: CustomEvent) {
    try {
      if (this.disableMore()) { (ev.target as HTMLIonInfiniteScrollElement).complete(); return; }
      const nextOffset = this.users().length;
      const { data, error } = await this.supabase.listProfiles({ q: this.q(), limit: this.pageSize(), offset: nextOffset, orderBy: 'created_at', ascending: false });
      if (!error && data?.length) { this.users.set([...this.users(), ...data]); }
    } finally { (ev.target as HTMLIonInfiniteScrollElement).complete(); }
  }

  async onSearch(ev: any) {
    const value = ev?.target?.value || '';
    this.q.set(value); this.page.set(1); await this.reload();
  }

  async nextPage() { if (this.page() < this.maxPage()) { this.page.set(this.page() + 1); await this.reload(); } }
  async prevPage() { if (this.page() > 1) { this.page.set(this.page() - 1); await this.reload(); } }
  async goTo(path: string) { await this.router.navigateByUrl(path); }

  async createUser() {
    const alert = await this.alerts.create({
      header: 'Crear usuario', cssClass: 'create-user-alert',
      inputs: [
        { name: 'email', type: 'email', placeholder: 'email@dominio.com' },
        { name: 'password', type: 'password', placeholder: 'Contraseña (mín. 6)' },
        { type: 'radio', label: 'admin', value: 'admin' },
        { type: 'radio', label: 'conductor', value: 'conductor', checked: true },
        { type: 'radio', label: 'cliente', value: 'cliente' }
      ],
      buttons: [ { text: 'Cancelar', role: 'cancel' }, { text: 'Crear', role: 'confirm' } ]
    });
    await alert.present();
    const res = await alert.onDidDismiss();
    if (res.role !== 'confirm') return;
    const values = (res.data as any)?.values || (res.data as any);
    const email = (values?.email || '').trim();
    const password = (values?.password || '').trim();
    const roleCandidate = (res.data as any)?.values ?? (values as any);
    const role: 'admin' | 'conductor' | 'cliente' = ['admin','conductor','cliente'].includes(roleCandidate) ? roleCandidate : 'conductor';
    if (!email || !password) { await this.notify('Email y contraseña requeridos'); return; }
    if (password.length < 6) { await this.notify('La contraseña debe tener al menos 6 caracteres'); return; }

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.signUpWithEmail(email, password);
      if (error) { await this.notify('No se pudo crear el usuario: ' + error.message); return; }
      const userId = data?.user?.id || data?.session?.user?.id;
      if (userId) { await this.supabase.upsertProfile({ id: userId, email, role }); }
      if (data?.session) { await this.notify('Usuario creado. Se cerrará tu sesión por seguridad. Inicia sesión nuevamente.'); await this.supabase.signOut(); return; }
      await this.notify('Usuario creado. Si la confirmación por email está activa, deberá confirmar su correo.');
      await this.reload();
    } finally { this.loading.set(false); }
  }

  async changeRole(u: any) {
    const alert = await this.alerts.create({
      header: 'Cambiar rol',
      inputs: [
        { type: 'radio', label: 'admin', value: 'admin', checked: (u.role || u.rol) === 'admin' },
        { type: 'radio', label: 'conductor', value: 'conductor', checked: (u.role || u.rol) === 'conductor' },
        { type: 'radio', label: 'cliente', value: 'cliente', checked: (u.role || u.rol) === 'cliente' }
      ],
      buttons: [ { text: 'Cancelar', role: 'cancel' }, { text: 'Guardar', role: 'confirm' } ]
    });
    await alert.present();
    const res = await alert.onDidDismiss();
    if (res.role !== 'confirm') return;
    const newRole = res.data?.values || res.data;
    const role = typeof newRole === 'string' ? newRole : (newRole?.[0] ?? (u.role || u.rol));
    const { error } = await this.supabase.updateProfileRole(u.id, role);
    if (error) { await this.notify('No se pudo actualizar el rol'); return; }
    await this.notify('Rol actualizado');
    await this.reload();
  }

  async confirmDelete(u: any) {
    const alert = await this.alerts.create({
      header: 'Eliminar usuario',
      message: `¿Eliminar perfil de "${u.full_name || u.email}"?`,
      buttons: [ { text: 'Cancelar', role: 'cancel' }, { text: 'Eliminar', role: 'destructive' } ]
    });
    await alert.present();
    const res = await alert.onDidDismiss();
    if (res.role !== 'destructive') return;
    const { error } = await this.supabase.deleteProfile(u.id);
    if (error) { await this.notify('No se pudo eliminar'); return; }
    await this.notify('Usuario eliminado');
    await this.reload();
  }

  async invite() {
    const alert = await this.alerts.create({
      header: 'Invitar usuario', inputs: [ { name: 'email', type: 'email', placeholder: 'email@dominio.com' } ],
      buttons: [ { text: 'Cancelar', role: 'cancel' }, { text: 'Enviar', role: 'confirm' } ]
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
    await this.messages.toastMsg(message, 'primary', 1500, 'top');
  }
}
