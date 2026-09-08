import { TestBed } from '@angular/core/testing'
import { describe, expect, it } from 'vitest'

import { ServiceTypeX, SmartAutomation } from '@/app/core/accessories/accessories.interfaces'
import { SmartAutomationFormComponent } from '@/app/modules/smart-automations/smart-automation-form/smart-automation-form.component'

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
      'Smart Light Group',
    ])
    expect(fixture.componentInstance.getAutomationDescription('smart-light-group')).toContain('Primarily designed for automations')
    expect(fixture.componentInstance.getAutomationDescription('smart-light-group')).toContain('motion is detected by the front door')
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
})
