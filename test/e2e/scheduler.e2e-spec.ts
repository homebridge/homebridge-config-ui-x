import { afterEach, describe, expect, it, vi } from 'vitest'

import { SchedulerService } from '../../src/core/scheduler/scheduler.service.js'

function makeService(ui: any, config: any) {
  const logger = {
    warn: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
  }
  const ipc = {
    restartHomebridge: vi.fn(),
    sendMessage: vi.fn(),
  }
  const configService = { ui, homebridgeConfig: config }
  return {
    service: new SchedulerService(configService as any, ipc as any, logger as any),
    logger,
    ipc,
  }
}

function restartJobNames(service: SchedulerService) {
  return Object.keys(service.scheduledJobs).filter(name => name.startsWith('restart-'))
}

describe('scheduled restarts', () => {
  let service: SchedulerService

  afterEach(async () => {
    await service.refreshRestartSchedules({ platforms: [], accessories: [] } as any)
  })

  it('schedules a child bridge once when several blocks share it, and a refresh leaves no job behind', async () => {
    const ui = {
      bridges: [
        { username: '0E:AA:BB:CC:DD:EE', scheduledRestartCron: '0 3 * * *' },
      ],
    }
    const config = {
      platforms: [
        {
          platform: 'A',
          _bridge: { username: '0E:AA:BB:CC:DD:EE' },
        },
        {
          platform: 'B',
          _bridge: { username: '0e:aa:bb:cc:dd:ee' },
        },
      ],
      accessories: [],
    }
    const made = makeService(ui, config)
    service = made.service
    const schedule = vi.spyOn(service as any, 'scheduleJob')

    await service.refreshRestartSchedules()
    expect(schedule).toHaveBeenCalledTimes(1)

    // node-schedule only keeps the newest job under one name, so a job made twice could not be cancelled by name
    // A copy: the refresh empties the service's own list in place, and `every` on an empty list is always true
    const jobs = [...(service as any).restartJobs]
    expect(jobs.length).toBeGreaterThan(0)
    await service.refreshRestartSchedules({ platforms: [], accessories: [] } as any)
    expect(jobs.every((job: any) => job.nextInvocation() === null)).toBe(true)
    expect(restartJobNames(service)).toEqual([])
  })

  it('warns about a cron it can not read, and keeps going past a bridge entry with no username', async () => {
    const ui = {
      scheduledRestartCron: 'not a cron',
      bridges: [
        { scheduledRestartCron: '0 3 * * *' },
        { username: '0E:11:11:11:11:11', scheduledRestartCron: '0 4 * * *' },
      ],
    }
    const config = {
      platforms: [
        {
          platform: 'A',
          _bridge: { username: '0E:11:11:11:11:11' },
        },
      ],
      accessories: [],
    }
    const made = makeService(ui, config)
    service = made.service

    await service.refreshRestartSchedules()

    expect(made.logger.warn).toHaveBeenCalledWith(expect.stringContaining('not a valid cron'))
    expect(restartJobNames(service)).toEqual(['restart-child-0E1111111111'])
  })
})
