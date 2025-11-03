import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { addIcons } from 'ionicons';
import { cloudUploadOutline, cloudUpload, navigateOutline, mapOutline, map, settings, car, carOutline, location } from 'ionicons/icons';
import { setAssetPath } from 'ionicons/components';

import { AppComponent } from './app/app.component';
import { routes } from './app/app-routing.module';

addIcons({
  'cloud-upload-outline': cloudUploadOutline,
  'cloud-upload': cloudUpload,
  'navigate-outline': navigateOutline,
  'map-outline': mapOutline,
  'map': map,
  'settings': settings,
  'car': car,
  'car-outline': carOutline,
  'location': location,
});

try {
  setAssetPath(new URL('./', import.meta.url).href);
} catch {}

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideHttpClient(),
    provideRouter(routes)
  ],
}).catch(err => console.log(err));
