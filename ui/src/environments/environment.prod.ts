export const environment = {
  production: true,
  socketUrl: `${(window.location.protocol) === 'http:' ? 'ws://' : 'wss://'}${window.location.host}`,
  apiBaseUrl: '',
  apiHttpOptions: {}
};
