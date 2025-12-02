import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private isDarkModeSubject = new BehaviorSubject<boolean>(false);
  public isDarkMode$: Observable<boolean> = this.isDarkModeSubject.asObservable();

  constructor() {
    // Check system preference on initialization
    this.checkSystemTheme();
    
    // Listen for system theme changes
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    darkModeQuery.addEventListener('change', () => this.checkSystemTheme());
  }

  private checkSystemTheme(): void {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.isDarkModeSubject.next(prefersDark);
    this.updateTheme(prefersDark);
  }

  public toggleTheme(): void {
    const currentTheme = this.isDarkModeSubject.value;
    const newTheme = !currentTheme;
    this.isDarkModeSubject.next(newTheme);
    this.updateTheme(newTheme);
  }

  public setTheme(isDark: boolean): void {
    this.isDarkModeSubject.next(isDark);
    this.updateTheme(isDark);
  }

  private updateTheme(isDark: boolean): void {
    if (isDark) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }

  public getCurrentTheme(): boolean {
    return this.isDarkModeSubject.value;
  }
}
