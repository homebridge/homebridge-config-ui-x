// The file contents for the current environment will overwrite these during build.
// The build system defaults to the dev environment which uses `environment.ts`, but if you do
// `ng build --env=prod` then `environment.prod.ts` will be used instead.
// The list of which env maps to which file can be found in `.angular-cli.json`.

export const environment = {
  production: false,
  api: {
    base: 'http://localhost:3000/api',
    socket: 'http://localhost:3000'
  },
  jwt: {
    tokenKey: 'access_token',
    whitelistedDomains: ['localhost:3000'],
    blacklistedRoutes: ['localhost:3000/api/auth/login'],
  },
  socketUrl: 'ws://localhost:8080',
  apiBaseUrl: 'http://localhost:8080',
  apiHttpOptions: {
    withCredentials: true
  }
};
