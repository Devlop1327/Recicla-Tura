import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

@Component({
  selector: 'app-avatar-uploader',
  standalone: true,
  imports: [IonicModule, CommonModule],
  template: `
    <ion-row class="avatar-upload ion-margin-top">
      <ion-col size="12">
        <input #fileInput type="file" accept="image/*" hidden (change)="onFileSelected($event)" />
        <ion-button size="small" color="medium" (click)="fileInput.click()">
          Elegir imagen
        </ion-button>
        <ion-button size="small" (click)="emitUpload()" [disabled]="!selectedFile">
          Subir Avatar
        </ion-button>
      </ion-col>
    </ion-row>
  `
})
export class AvatarUploaderComponent {
  @Output() fileSelected = new EventEmitter<File>();
  @Output() upload = new EventEmitter<void>();

  selectedFile: File | null = null;

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (file) {
      this.selectedFile = file;
      this.fileSelected.emit(file);
    }
  }

  emitUpload() {
    if (!this.selectedFile) return;
    this.upload.emit();
  }
}
