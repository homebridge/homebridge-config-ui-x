import process from 'node:process'

// Default timeout for npm registry requests (30 seconds)
// Can be configured via NPM_CONFIG_FETCH_TIMEOUT environment variable (in milliseconds)
const DEFAULT_NPM_FETCH_TIMEOUT = 30000
export const NPM_FETCH_TIMEOUT = Number(process.env.NPM_CONFIG_FETCH_TIMEOUT) || DEFAULT_NPM_FETCH_TIMEOUT
