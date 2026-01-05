// The file contents for the current environment will overwrite these during build.
// The build system defaults to the dev environment which uses `environment.ts`, but if you do
// `ng build --env=prod` then `environment.prod.ts` will be used instead.
// The list of which env maps to which file can be found in `.angular-cli.json`.

// Use current hostname to avoid CORS issues when accessing from non-localhost (e.g., local IP)
const backendHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
const backendUrl = `http://${backendHost}:8581`

export const environment = {
  // eslint-disable-next-line ts/no-require-imports
  serverTarget: require('../../../package.json').version,
  production: false,
  api: {
    base: `${backendUrl}/api`,
    socket: backendUrl,
    origin: backendUrl,
  },
  jwt: {
    tokenKey: 'access_token',
    allowedDomains: [`${backendHost}:8581`],
    disallowedRoutes: [`${backendUrl}/api/auth/login`],
  },
  apiHttpOptions: {
    withCredentials: true,
  },
  owm: {
    appid: 'fec67b55f7f74deaa28df89ba6a60821',
  },
}
