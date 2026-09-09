import { NO_ERRORS_SCHEMA, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { describe, expect, it, vi } from 'vitest'

import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { SmartAutomationsComponent } from '@/app/modules/smart-automations/smart-automations.component'
import { fakeApi, makeAuth, makeSettings } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

describe('smartAutomationsComponent', () => {
  function createComponent(api = fakeApi()) {
    const accessories = {
      rooms: signal([]),
      start: vi.fn(async () => undefined),
      stop: vi.fn(),
    }

    TestBed.configureTestingModule({
      providers: [
        provideTestTranslate(),
        provideFakes({
          api,
          auth: makeAuth({ user: { admin: true } }),
          settings: makeSettings(),
        }),
        { provide: AccessoriesService, useValue: accessories },
      ],
    })
    TestBed.overrideComponent(SmartAutomationsComponent, {
      set: { imports: [], schemas: [NO_ERRORS_SCHEMA], template: '' },
    })

    return { api, accessories, component: TestBed.createComponent(SmartAutomationsComponent).componentInstance }
  }

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
        provideTestTranslate(),
        provideFakes({
          api,
          auth: makeAuth({ user: { admin: true } }),
          settings: makeSettings(),
        }),
        { provide: AccessoriesService, useValue: accessories },
      ],
    })
    TestBed.overrideComponent(SmartAutomationsComponent, {
      set: { imports: [], schemas: [NO_ERRORS_SCHEMA], template: '' },
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

  it('does not expose an automation in the UI when its config write fails', async () => {
    const error = new Error('config unavailable')
    const api = fakeApi()
      .respond('get', '/config-editor/plugin/smart-automation', [])
      .fail('post', '/config-editor/plugin/smart-automation', error)
    const { component } = createComponent(api)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    component.smartAutomationDraft = {
      name: 'Kitchen Group',
      type: 'smart-light-group',
      lightbulbType: 'on-off',
      enabled: true,
    }
    component.selectedLightUniqueIds.set(['light-1'])

    await component.saveSmartAutomation()

    expect(component.smartAutomations()).toEqual([])
    expect(component.smartAutomationDraft.name).toBe('Kitchen Group')
    expect(consoleError).toHaveBeenCalledWith(error)
  })

  it('keeps existing automation state when delete or toggle persistence fails', async () => {
    const api = fakeApi()
      .respond('get', '/config-editor/plugin/smart-automation', [])
      .fail('post', '/config-editor/plugin/smart-automation', new Error('config unavailable'))
    const { component } = createComponent(api)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const automation = {
      id: 'automation-1',
      name: 'Kitchen Group',
      type: 'smart-light-group',
      lightbulbType: 'on-off',
      uniqueIds: ['light-1'],
      enabled: true,
    } as const
    component.smartAutomations.set([{ ...automation, uniqueIds: [...automation.uniqueIds] }])

    await component.setSmartAutomationEnabled(component.smartAutomations()[0], false)
    expect(component.smartAutomations()[0].enabled).toBe(true)

    await component.deleteSmartAutomation(automation.id)
    expect(component.smartAutomations()).toHaveLength(1)
  })

  it('records a newly created bridge even when its immediate restart fails', async () => {
    const restartError = new Error('bridge has not started yet')
    const api = fakeApi()
      .respond('get', '/config-editor/plugin/smart-automation', [])
      .respond('post', '/config-editor/plugin/smart-automation', [])
      .fail('put', /\/server\/restart\//, restartError)
    const { component } = createComponent(api)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    component.smartAutomationDraft = {
      name: 'Kitchen Group',
      type: 'smart-light-group',
      lightbulbType: 'on-off',
      enabled: true,
    }
    component.selectedLightUniqueIds.set(['light-1'])

    await component.saveSmartAutomation()

    expect(component.smartAutomations()).toHaveLength(1)
    expect(component.childBridgeUsername()).toMatch(/^0E(?::[0-9A-F]{2}){5}$/)
    expect(consoleError).toHaveBeenCalledWith(restartError)
  })

  it('persists the average-temperature removal interval in minutes', async () => {
    const api = fakeApi()
      .respond('get', '/config-editor/plugin/smart-automation', [])
      .respond('post', '/config-editor/plugin/smart-automation', [])
      .respond('put', /\/server\/restart\//, {})
    const { component } = createComponent(api)
    component.smartAutomationDraft = {
      name: 'Backyard Average',
      type: 'average-temperature',
      removeAfterMinutes: 12.4,
      enabled: true,
    }
    component.selectedLightUniqueIds.set(['sensor-1', 'sensor-2'])

    await component.saveSmartAutomation()

    expect(api.lastCall('post', '/config-editor/plugin/smart-automation')?.body[0].smartAutomations[0])
      .toEqual(expect.objectContaining({ removeAfterMinutes: 12 }))
  })
})
