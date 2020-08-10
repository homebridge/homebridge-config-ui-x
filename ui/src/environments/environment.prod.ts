export const environment = {
  production: true,
  socket: '',
  api: {
    base: '/api',
    socket: `${(window.location.protocol) === 'http:' ? 'ws://' : 'wss://'}${window.location.host}`,
  },
  jwt: {
    tokenKey: 'access_token',
    allowedDomains: [document.location.host],
    disallowedRoutes: [`${document.location.host}/api/auth/login`],
  },
  apiHttpOptions: {},
  owm: {
    appid: 'fec67b55f7f74deaa28df89ba6a60821',
  },
};
