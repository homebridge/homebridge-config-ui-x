export const environment = {
  production: true,
  socket: '',
  api: {
    base: '/api',
  },
  jwt: {
    tokenKey: 'access_token',
    whitelistedDomains: [document.location.host],
    blacklistedRoutes: [`${document.location.host}/api/auth/login`],
  },
  socketUrl: `${(window.location.protocol) === 'http:' ? 'ws://' : 'wss://'}${window.location.host}`,
  apiBaseUrl: '',
  apiHttpOptions: {}
};
