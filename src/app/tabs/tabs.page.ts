import { Component, inject, OnInit } from '@angular/core';
import { 
  IonTabs, 
  IonTabBar, 
  IonTabButton, 
  IonIcon, 
  IonLabel, 
  IonHeader, 
  IonToolbar, 
  IonTitle, 
  IonContent, 
  IonButtons, 
  IonButton, 
  IonBadge,
  IonMenuButton,
  IonSplitPane,
  IonMenu,
  IonApp,
  IonList,
  IonItem,
  MenuController
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    IonTabs, 
    IonTabBar, 
    IonTabButton, 
    IonIcon, 
    IonLabel, 
    IonHeader, 
    IonToolbar, 
    IonTitle, 
    IonContent, 
    IonButtons,
    IonButton,
    IonBadge,
    IonMenuButton,
    IonSplitPane,
    IonMenu,
    IonApp,
    IonList,
    IonItem
  ]
})
export class TabsPage implements OnInit {
  private router = inject(Router);
  private menuCtrl = inject(MenuController);
  private supabaseService = inject(SupabaseService);
  
  currentTitle = 'Inicio';
  unreadNotifications = 0; // Conectar con tu servicio de notificaciones
  isDesktop = false; // Para controlar si estamos en escritorio o móvil

  constructor() {
    this.checkScreenSize();
  }

  ngOnInit() {
    this.setupMenu();
  }

  private checkScreenSize() {
    // Verificar si estamos en un dispositivo móvil o escritorio
    this.isDesktop = window.innerWidth > 768;
    
    // Escuchar cambios en el tamaño de la pantalla
    window.addEventListener('resize', () => {
      this.isDesktop = window.innerWidth > 768;
    });
  }

  private async setupMenu() {
    // Habilitar gestos de deslizar para abrir/cerrar el menú
    const menu = await this.menuCtrl.get('main-menu');
    if (menu) {
      menu.swipeGesture = true;
    }
  }

  // Método para actualizar el título según la pestaña activa
  updateTitle(title: string) {
    this.currentTitle = title;
  }

  // Navegar a una ruta específica
  async navigateTo(route: string) {
    // Cerrar el menú si estamos en móvil
    if (!this.isDesktop) {
      await this.menuCtrl.close('main-menu');
    }
    this.router.navigate(['/tabs', route]);
    this.updateTitle(this.getTitleFromRoute(route));
  }

  // Obtener el título de la ruta actual
  private getTitleFromRoute(route: string): string {
    const titles: {[key: string]: string} = {
      'home': 'Inicio',
      'vehicles': 'Vehículos',
      'notifications': 'Notificaciones',
      'profile': 'Perfil'
    };
    return titles[route] || 'Inicio';
  }

  // Cerrar el menú
  async closeMenu() {
    await this.menuCtrl.close('main-menu');
  }

  // Alternar menú (para usar con botones personalizados si es necesario)
  async toggleMenu() {
    const menu = await this.menuCtrl.get('main-menu');
    if (menu) {
      menu.toggle();
    }
  }

  // Cerrar sesión
  async logout() {
    try {
      await this.menuCtrl.close('main-menu');
      await this.supabaseService.signOut();
      await this.router.navigate(['/login']);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  }
}
