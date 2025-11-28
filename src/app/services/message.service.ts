import { Injectable } from '@angular/core';
import { ToastController } from '@ionic/angular';

@Injectable({ providedIn: 'root' })
export class MessageService {
  constructor(private toast: ToastController) {}

  async toastMsg(
    message: string,
    color: 'primary' | 'success' | 'warning' | 'danger' | 'medium' = 'primary',
    duration = 1500,
    position: 'top' | 'middle' | 'bottom' = 'bottom'
  ) {
    const t = await this.toast.create({ message, color, duration, position });
    await t.present();
  }
}
