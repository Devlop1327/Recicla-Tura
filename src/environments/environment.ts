export const environment = {
  production: false,
  supabase: {
    url: 'https://mrzurvgbgiuoznjmieby.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yenVydmdiZ2l1b3puam1pZWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzODI0MzMsImV4cCI6MjA3NTk1ODQzM30.dh6D_BzM2b07d1lyZBPk6MHQgsRbXdjbJAuYmrtodb0'
  },
  api: {
    // En desarrollo usamos el proxy de Angular para evitar CORS
    baseUrl: 'https://apirecoleccion.gonzaloandreslucio.com/api/',
    profileId: '3c4e03f8-102a-47c8-b4bc-6e86b7cdef07',
    supportsRecorridos: true
  },
  map: {
    center: {
      lat: 3.8833,
      lng: -77.0167
    },
    zoom: 13
  }
};