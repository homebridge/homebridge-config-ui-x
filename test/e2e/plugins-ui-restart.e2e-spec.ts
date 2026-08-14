import type { TestingModule } from '@nestjs/testing'

import { resolve } from 'node:path'
import process from 'node:process'

import { Test } from '@nestjs/testing'
import { copy } from 'fs-extra'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { PluginsModule } from '../../src/modules/plugins/plugins.module.js'
import { PluginsService } from '../../src/modules/plugins/plugins.service.js'

/**
 * Updating the UI to a new version arms a delayed `process.exit(0)` so the
 * service manager restarts it on the new code.
 *
 * That fuse must not outlive the module that lit it. As a bare `setTimeout` it
 * did: an e2e test hitting `POST /plugins/update/homebridge-config-ui-x`
 * finished, and five seconds later the timer killed the whole vitest worker
 * with "process.exit unexpectedly called with 0" - long after the test that
 * caused it had passed. It only bit when the worker happened to still be
 * running at that point, so it stayed dormant until an unrelated test file
 * shifted the timing, then failed on every platform at once.
 */
describe('PluginsService UI self-restart timer', () => {
  let app: TestingModule
  let pluginsService: PluginsService
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')

    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)

    app = await Test.createTestingModule({ imports: [PluginsModule] }).compile()
    pluginsService = app.get(PluginsService)
  })

  beforeEach(() => {
    vi.useFakeTimers()
    // Never let a real exit through, even if the guard under test regresses.
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
  })

  afterEach(() => {
    vi.useRealTimers()
    exitSpy.mockRestore()
  })

  afterAll(async () => {
    await app.close()
  })

  it('exits once the delay elapses while the module is still alive', () => {
    (pluginsService as any).scheduleUiRestart()

    vi.advanceTimersByTime(5000)
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('does not exit if the module is destroyed before the delay elapses', () => {
    (pluginsService as any).scheduleUiRestart()

    pluginsService.onModuleDestroy()
    vi.advanceTimersByTime(60_000)

    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('does not hold the process open on its own', () => {
    (pluginsService as any).scheduleUiRestart()

    const timer = (pluginsService as any).uiRestartTimer

    expect(timer.hasRef()).toBe(false)
    pluginsService.onModuleDestroy()
  })
})
