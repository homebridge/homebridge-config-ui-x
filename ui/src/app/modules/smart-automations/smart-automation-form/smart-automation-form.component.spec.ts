import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { beforeEach, describe, expect, it } from 'vitest'

import { ServiceTypeX, SmartAutomation } from '@/app/core/accessories/accessories.interfaces'
import { SmartAutomationFormComponent } from '@/app/modules/smart-automations/smart-automation-form/smart-automation-form.component'
import { provideTestTranslate } from '@/testing/providers'

function publishedLight(automationId: string): ServiceTypeX {
  return {
    type: 'Lightbulb',
    accessoryInformation: {
      'Manufacturer': 'homebridge-config-ui-x',
      'Serial Number': automationId,
    },
    serviceCharacteristics: [],
  } as unknown as ServiceTypeX
}

describe('smartAutomationFormComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestTranslate()] })
    TestBed.inject(TranslateService).setTranslation('en', {
      'smart_automation.type.average_temperature': 'Average Temperature Sensor',
      'smart_automation.type.door_ajar': 'Door Left Ajar',
      'smart_automation.type.humidity_control': 'Humidity-controlled AC',
      'smart_automation.type.security_system': 'Security System',
      'smart_automation.type.smart_light_group': 'Smart Light Group',
    })
  })

  it('sorts automation types by their displayed names', () => {
    const fixture = TestBed.createComponent(SmartAutomationFormComponent)
    fixture.componentRef.setInput('draft', { type: 'smart-light-group' } satisfies Partial<SmartAutomation>)
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement
    const labels = [...element.querySelectorAll<HTMLOptionElement>('#smart-automation-type option')]
      .map(option => option.textContent?.trim())

    expect(labels).toEqual([
      'Average Temperature Sensor',
      'Door Left Ajar',
      'Humidity-controlled AC',
      'Security System',
      'Smart Light Group',
    ])
    expect(fixture.componentInstance.getAutomationDescription('smart-light-group')).toBe('smart_automation.description.smart_light_group')
  })

  it('offers contact and motion sensors to a security system', () => {
    const fixture = TestBed.createComponent(SmartAutomationFormComponent)
    fixture.componentRef.setInput('draft', { type: 'security-system' } satisfies Partial<SmartAutomation>)
    fixture.detectChanges()

    expect(fixture.componentInstance.selectableTypes('security-system')).toEqual(['ContactSensor', 'MotionSensor'])
    expect(fixture.componentInstance.getAutomationDescription('security-system')).toBe('smart_automation.description.security_system')
  })

  it('excludes only the accessory published by the automation being edited', () => {
    const fixture = TestBed.createComponent(SmartAutomationFormComponent)
    fixture.componentRef.setInput('draft', {
      id: 'automation-1',
      type: 'smart-light-group',
    } satisfies Partial<SmartAutomation>)
    fixture.detectChanges()

    expect(fixture.componentInstance.isSourceSelectable(publishedLight('automation-1'), 'smart-light-group')).toBe(false)
    expect(fixture.componentInstance.isSourceSelectable(publishedLight('automation-2'), 'smart-light-group')).toBe(true)
  })

  it('does not exclude published accessories while creating a new automation', () => {
    const fixture = TestBed.createComponent(SmartAutomationFormComponent)
    fixture.componentRef.setInput('draft', { type: 'smart-light-group' } satisfies Partial<SmartAutomation>)
    fixture.detectChanges()

    expect(fixture.componentInstance.isSourceSelectable(publishedLight('automation-1'), 'smart-light-group')).toBe(true)
  })

  it('shows the stale-reading interval for average temperature automations', () => {
    const fixture = TestBed.createComponent(SmartAutomationFormComponent)
    fixture.componentRef.setInput('draft', { type: 'average-temperature' } satisfies Partial<SmartAutomation>)
    fixture.detectChanges()

    const input = (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLInputElement>('#smart-automation-remove-after-minutes')
    expect(input?.value).toBe('30')
  })

  it('selects only the chosen humidity source and control target', () => {
    const fixture = TestBed.createComponent(SmartAutomationFormComponent)
    fixture.componentRef.setInput('draft', { type: 'humidity-control' } satisfies Partial<SmartAutomation>)
    fixture.componentRef.setInput('selectedLightUniqueIds', ['humidity-2'])
    fixture.componentRef.setInput('selectedTargetUniqueId', 'switch-2')
    fixture.componentRef.setInput('rooms', [{
      name: 'Outside',
      services: [
        { uniqueId: 'humidity-1', type: 'HumiditySensor', serviceName: 'Humidity One', serviceCharacteristics: [{ type: 'CurrentRelativeHumidity' }] },
        { uniqueId: 'humidity-2', type: 'HumiditySensor', serviceName: 'Humidity Two', serviceCharacteristics: [{ type: 'CurrentRelativeHumidity' }] },
        { uniqueId: 'switch-1', type: 'Switch', serviceName: 'Switch One', serviceCharacteristics: [{ type: 'On', canWrite: true }] },
        { uniqueId: 'switch-2', type: 'Switch', serviceName: 'Switch Two', serviceCharacteristics: [{ type: 'On', canWrite: true }] },
      ] as unknown as ServiceTypeX[],
    }])
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement
    const sources = [...element.querySelectorAll<HTMLInputElement>('input[name="smart-auto-humidity-source"]')]
    const targets = [...element.querySelectorAll<HTMLInputElement>('input[name="smart-auto-humidity-target"]')]
    expect(sources.map(input => input.checked)).toEqual([false, true])
    expect(targets.map(input => input.checked)).toEqual([false, true])
  })

  it('emits close without changing the saved automation', () => {
    const fixture = TestBed.createComponent(SmartAutomationFormComponent)
    fixture.componentRef.setInput('draft', {
      id: 'automation-1',
      name: 'Dining Room',
      type: 'smart-light-group',
    } satisfies Partial<SmartAutomation>)
    const closed: void[] = []
    fixture.componentInstance.cancelEdit.subscribe(value => closed.push(value))

    fixture.detectChanges()
    const element = fixture.nativeElement as HTMLElement
    element.querySelector<HTMLButtonElement>('.btn-elegant')!.click()

    expect(closed).toHaveLength(1)
    expect(fixture.componentInstance.draft().name).toBe('Dining Room')
  })

  it('offers reset when a new automation is ready to create', () => {
    const fixture = TestBed.createComponent(SmartAutomationFormComponent)
    fixture.componentRef.setInput('draft', {
      name: 'Dining Room',
      type: 'smart-light-group',
    } satisfies Partial<SmartAutomation>)
    fixture.componentRef.setInput('selectedLightUniqueIds', ['light-1'])
    const reset: void[] = []
    fixture.componentInstance.cancelEdit.subscribe(value => reset.push(value))
    fixture.detectChanges()

    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')]
    const resetButton = buttons.find(button => button.textContent?.trim() === 'smart_automation.action.reset')
    resetButton?.click()

    expect(resetButton).toBeDefined()
    expect(reset).toHaveLength(1)
  })
})
