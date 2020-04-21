const baseHref = window.location.pathname.split('/')[1] === 'homebridge' ? '/homebridge' : '';

export const environment = {
  production: true,
  socket: `${baseHref}`,
  api: {
    base: `${baseHref}/api`,
    socket: `${(window.location.protocol) === 'http:' ? 'ws://' : 'wss://'}${window.location.host}`,
    socketPath: `${baseHref}/socket.io`,
  },
  jwt: {
    tokenKey: 'access_token',
    whitelistedDomains: [document.location.host],
    blacklistedRoutes: [`${document.location.host}${baseHref}/api/auth/login`],
  },
  apiHttpOptions: {},
  owm: {
    appid: 'fec67b55f7f74deaa28df89ba6a60821',
  },
};
