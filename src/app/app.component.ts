import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import './leaflet-fix';
import { Router, NavigationStart, NavigationEnd, NavigationCancel, NavigationError, RoutesRecognized, Event } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  homeOutline,
  notificationsOutline,
  personOutline,
  carOutline,
  logOutOutline,
  closeOutline,
  mapOutline,
  locationOutline,
  closeCircleOutline,
  saveOutline,
  list,
  colorPalette,
  speedometer,
  createOutline,
  trashOutline,
  alertCircle,
  checkmark,
  notificationsOff,
  checkmarkDone,
  map,
  car,
  location,
  informationCircle,
  warning,
  checkmarkCircle,
  notifications,
  leafOutline,
  leaf
} from 'ionicons/icons';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true,
  imports: [IonicModule]
})
export class AppComponent {
  constructor(private router: Router) {
    addIcons({
      homeOutline,
      notificationsOutline,
      personOutline,
      carOutline,
      logOutOutline,
      closeOutline,
      mapOutline,
      locationOutline,
      closeCircleOutline,
      saveOutline,
      list,
      colorPalette,
      speedometer,
      createOutline,
      trashOutline,
      alertCircle,
      checkmark,
      notificationsOff,
      checkmarkDone,
      map,
      car,
      location,
      informationCircle,
      warning,
      checkmarkCircle,
      notifications,
      leafOutline,
      leaf
    });

    this.router.events.subscribe((e: Event) => {
      if (e instanceof NavigationStart) {
        console.log('[Router] NavigationStart =>', e.url);
      } else if (e instanceof RoutesRecognized) {
        console.log('[Router] RoutesRecognized =>', e.url, e.state);
      } else if (e instanceof NavigationEnd) {
        console.log('[Router] NavigationEnd =>', e.urlAfterRedirects);
      } else if (e instanceof NavigationCancel) {
        console.warn('[Router] NavigationCancel =>', e.url, e.reason);
      } else if (e instanceof NavigationError) {
        console.error('[Router] NavigationError =>', e.url, e.error);
      }
    });
  }
}
