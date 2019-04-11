export const environment = {
  production: true,
  socket: '',
  api: {
    base: '/api',
    socket: `${(window.location.protocol) === 'http:' ? 'ws://' : 'wss://'}${window.location.host}`,
  },
  jwt: {
    tokenKey: 'access_token',
    whitelistedDomains: [document.location.host],
    blacklistedRoutes: [`${document.location.host}/api/auth/login`],
  },
  apiHttpOptions: {},
};
