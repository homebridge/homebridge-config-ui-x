import { execSync } from 'node:child_process'
import { platform } from 'node:os'
import { dirname } from 'node:path'
import process from 'node:process'

import { Logger } from './core/logger/logger.service'

const logger = new Logger()

function tryRebuildNodePtyModule() {
  const modulePath = dirname(dirname(require.resolve('@homebridge/node-pty-prebuilt-multiarch')))

  logger.warn('[node-pty] Trying to rebuild automatically...')
  logger.warn(`[node-pty] Path: ${modulePath}.`)
  try {
    execSync('npm run install --unsafe-perm', {
      cwd: modulePath,
      stdio: 'ignore',
    })
  } catch (e) {
    if (platform() !== 'win32') {
      execSync('sudo -E -n run install --unsafe-perm', {
        cwd: modulePath,
        stdio: 'ignore',
      })
    } else {
      throw e
    }
  }
}

/**
 * The purpose of this script is to check the environment before launching the UI
 */
function main() {
  // check if node-pty is built correctly
  try {
    // eslint-disable-next-line ts/no-require-imports
    require('@homebridge/node-pty-prebuilt-multiarch')
  } catch (e) {
    logger.error(e)
    logger.error(`[node-pty] Node.js ${process.version}.`)
    logger.error('[node-pty] Failed to load node-pty module.')
    logger.error('[node-pty] This could be because the installation of this plugin did not complete successfully '
      + 'or you may have recently upgraded Node.js to a new major version.')
    logger.error('[node-pty] Follow the steps below to resolve this issue.')

    try {
      tryRebuildNodePtyModule()
      logger.warn('[node-pty] Module rebuilt successfully (maybe) - if you are still encountering errors follow the steps below.')
    } catch (rebuildError) {
      logger.error('[node-pty] Failed to rebuild npm modules automatically. Manual operation is now required.')
    }

    const modulePath = dirname(__dirname)

    if ((process.env.UIX_SERVICE_MODE === '1')) {
      if (platform() === 'win32') {
        logger.warn('[node-pty] From the Node.js command prompt (run as Administrator) run this command to rebuild npm modules:\n')
        logger.warn('hb-service rebuild\n')
      } else {
        logger.warn('[node-pty] From the terminal run this command to rebuild npm modules:\n')
        logger.warn('sudo hb-service rebuild\n')
      }
      throw new Error('Node.js global modules rebuild required. See log errors above.')
    } else {
      if (platform() === 'win32') {
        logger.warn('[node-pty] From the Node.js command prompt (run as Administrator) run these commands (exact commands may vary):\n')
        logger.warn('npm uninstall -g homebridge-config-ui-x')
        logger.warn('npm install -g homebridge-config-ui-x\n')
      } else if (platform() === 'darwin') {
        logger.warn('[node-pty] From the terminal run these commands (exact commands may vary):\n')
        logger.warn(`cd ${modulePath}`)
        logger.warn('sudo npm rebuild --unsafe-perm\n')
      } else {
        logger.warn('[node-pty] From the terminal run these commands (exact commands may vary):\n')
        logger.warn(`cd ${modulePath}`)
        logger.warn('sudo npm rebuild --unsafe-perm\n')
      }
    }
    process.exit(1)
  }
}

main()

/**
 * Catch startup errors
 */
process.on('unhandledRejection', (err: any) => {
  logger.error(err.toString())
  if (err.code === 'EADDRINUSE') {
    logger.error(`Another process or service on this host is using port ${err.port}.`)
    logger.error('Please stop the other service or change the port you have assigned to Homebridge UI.')
    logger.error('Ending process now.')
    setTimeout(() => process.exit(0))
  } else if (err.code === 'EACCES') {
    logger.error(`The process owner does not have permission to run services on port ${err.port}.`)
    logger.error('Please change the Homebridge UI port to something above 1024.')
    logger.error('Ending process now.')
    setTimeout(() => process.exit(0))
  } else {
    logger.error('Caught unhandled rejection error - details below:')
    console.error(err)
  }
})
