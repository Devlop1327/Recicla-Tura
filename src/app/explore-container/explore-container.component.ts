import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonGrid, IonRow, IonCol, IonText, IonButton } from '@ionic/angular/standalone';

@Component({
  selector: 'app-explore-container',
  templateUrl: './explore-container.component.html',
  styleUrls: ['./explore-container.component.scss'],
  standalone: true,
  imports: [CommonModule, IonGrid, IonRow, IonCol, IonText, IonButton]
})
export class ExploreContainerComponent {

  @Input() name?: string;

}
