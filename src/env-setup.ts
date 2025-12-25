import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Set UIX_BASE_PATH early so it's available when modules are loaded
process.env.UIX_BASE_PATH = process.env.UIX_BASE_PATH_OVERRIDE || resolve(__dirname, '../')
