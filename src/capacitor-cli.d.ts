declare module '@capacitor/cli' {
  // Definimos solo lo que necesitamos para el tipado del proyecto.
  // Si quieres algo más estricto, se puede extender esta interfaz.
  export interface CapacitorConfig {
    appId: string;
    appName: string;
    webDir: string;
    bundledWebRuntime?: boolean;
    [key: string]: any;
  }
}
