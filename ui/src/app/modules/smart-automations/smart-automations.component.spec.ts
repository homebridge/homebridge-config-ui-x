import { NO_ERRORS_SCHEMA, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { describe, expect, it, vi } from 'vitest'

import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { SmartAutomationsComponent } from '@/app/modules/smart-automations/smart-automations.component'
import { fakeApi, makeAuth, makeSettings } from '@/testing'
import { provideFakes } from '@/testing/providers'

describe('smartAutomationsComponent', () => {
  it('loads saved automations without waiting for accessory discovery', async () => {
    let finishConfigLoad!: (value: any) => void
    const configLoad = new Promise(resolve => finishConfigLoad = resolve)
    const api = fakeApi().respond('get', '/config-editor/plugin/smart-automation', configLoad).respond('get', '/config-editor', { disabledPlugins: [] })
    const accessories = {
      rooms: signal([]),
      start: vi.fn(() => new Promise<void>(() => {})),
      stop: vi.fn(),
    }

    TestBed.configureTestingModule({
      providers: [
        provideFakes({
          api,
          auth: makeAuth({ user: { admin: true } }),
          settings: makeSettings(),
        }),
        { provide: AccessoriesService, useValue: accessories },
      ],
    })
    TestBed.overrideComponent(SmartAutomationsComponent, {
      set: { imports: [], schemas: [NO_ERRORS_SCHEMA] },
    })

    const fixture = TestBed.createComponent(SmartAutomationsComponent)
    fixture.detectChanges()

    expect(fixture.componentInstance.automationsLoading()).toBe(true)
    finishConfigLoad([{
      platform: 'smart-automation',
      smartAutomations: [{
        id: 'automation-1',
        name: 'Dining Room',
        type: 'smart-light-group',
        uniqueIds: ['light-1'],
        enabled: true,
      }],
    }])
    await Promise.resolve()
    await Promise.resolve()

    expect(accessories.start).toHaveBeenCalledOnce()
    expect(api.callsTo('get', '/config-editor/plugin/smart-automation')).toHaveLength(1)
    expect(fixture.componentInstance.automationsLoading()).toBe(false)
    expect(fixture.componentInstance.smartAutomations()).toEqual([
      expect.objectContaining({ id: 'automation-1', name: 'Dining Room' }),
    ])
  })
})
