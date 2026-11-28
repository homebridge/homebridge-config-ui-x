import packageJson from '../../../package.json'
import { webRootFromPage } from './web-root'

const webRoot = webRootFromPage()

export const environment = {
  serverTarget: packageJson.version,
  production: true,
  socket: '',
  api: {
    base: `${webRoot}/api`,
    socket: `${(window.location.protocol) === 'http:'
      ? 'ws://'
      : 'wss://'}${window.location.host}`,
    socketPath: `${webRoot}/socket.io`,
    origin: window.location.origin,
    webRoot,
  },
  jwt: {
    tokenKey: 'access_token',
    allowedDomains: [document.location.host],
    disallowedRoutes: [
      `${window.location.protocol}//${document.location.host}${webRoot}/api/auth/login`,
    ],
  },
  apiHttpOptions: {},
  owm: {
    appid: 'fec67b55f7f74deaa28df89ba6a60821',
  },
}
