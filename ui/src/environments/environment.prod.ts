export const environment = {
  // eslint-disable-next-line ts/no-require-imports
  serverTarget: require('../../../package.json').version,
  production: true,
  socket: '',
  api: {
    base: (() => {
      const baseElement = document.querySelector('base')
      const baseHref = baseElement?.getAttribute('href') || '/'
      return baseHref.endsWith('/') ? `${baseHref}api` : `${baseHref}/api`
    })(),
    socket: `${(window.location.protocol) === 'http:' ? 'ws://' : 'wss://'}${window.location.host}`,
    origin: window.location.origin,
  },
  jwt: {
    tokenKey: 'access_token',
    allowedDomains: [document.location.host],
    disallowedRoutes: [(() => {
      const baseElement = document.querySelector('base')
      const baseHref = baseElement?.getAttribute('href') || '/'
      const apiBase = baseHref.endsWith('/') ? `${baseHref}api` : `${baseHref}/api`
      return `${window.location.protocol}//${document.location.host}${apiBase}/auth/login`
    })()],
  },
  apiHttpOptions: {},
  owm: {
    appid: 'fec67b55f7f74deaa28df89ba6a60821',
  },
}
