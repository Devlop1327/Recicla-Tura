import { Component, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

@Component({
  selector: 'app-recorrido-map-container',
  standalone: true,
  imports: [IonicModule, CommonModule],
  template: `
    <div id="recorrido-map" style="width: 100%; height: 300px"></div>
  `
})
export class RecorridoMapContainerComponent implements AfterViewInit {
  ngAfterViewInit() {
    // El mapa se inicializa desde ConductorRecorridoPage.ensureMap()
  }
}
