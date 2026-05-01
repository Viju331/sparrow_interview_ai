export const environment = {
  production: true,
  apiUrl: (window as any).__SPARROW_API_URL || 'http://localhost:5082',
  wsUrl: (window as any).__SPARROW_WS_URL || 'http://localhost:5082/hubs/session',
};
