import process from 'node:process'

process.title = 'homebridge-config-ui-x'

setInterval(() => {
  if (!process.connected) {
    process.exit(1)
  }
}, 10000)

process.on('disconnect', () => {
  process.exit()
})

import('../main')
