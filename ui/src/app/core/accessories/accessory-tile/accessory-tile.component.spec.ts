import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import type { ComponentFixture } from '@angular/core/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslatePipe } from '@ngx-translate/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { AccessoryTileComponent } from '@/app/core/accessories/accessory-tile/accessory-tile.component'
import { hapService, matterService } from '@/testing'
import { provideTestTranslate } from '@/testing/providers'

/**
 * The tile decides which of the 70-odd type components renders for an
 * accessory. Getting that wrong shows the user the wrong controls entirely,
 * and the mapping is a wall of template cases that nothing else checks.
 *
 * The child components are swapped out for plain unknown elements: the tags
 * still appear in the DOM, so the routing is fully observable, without
 * dragging every child's dependencies into the spec.
 */
describe('AccessoryTileComponent', () => {
  let accessories: { hapReadyForControl: boolean, matterReadyForControl: boolean, showAccessoryInformation: ReturnType<typeof vi.fn> }
  let fixture: ComponentFixture<AccessoryTileComponent>

  beforeEach(() => {
    accessories = {
      hapReadyForControl: true,
      matterReadyForControl: true,
      showAccessoryInformation: vi.fn(),
    }

    TestBed.configureTestingModule({
      imports: [AccessoryTileComponent],
      providers: [
        provideTestTranslate(),
        { provide: AccessoriesService, useValue: accessories },
      ],
    })

    TestBed.overrideComponent(AccessoryTileComponent, {
      set: { imports: [TranslatePipe], schemas: [NO_ERRORS_SCHEMA] },
    })
  })

  function render(service: ServiceTypeX): HTMLElement {
    fixture = TestBed.createComponent(AccessoryTileComponent)
    fixture.componentRef.setInput('service', service)
    fixture.detectChanges()
    return fixture.nativeElement as HTMLElement
  }

  /** Which `app-*` type element the tile chose. */
  function renderedType(element: HTMLElement): string | undefined {
    return [...element.querySelectorAll('*')]
      .map(node => node.tagName.toLowerCase())
      .find(tag => tag.startsWith('app-'))
  }

  describe('hap accessories', () => {
    it.each([
      ['Switch', 'app-switch'],
      ['Thermostat', 'app-thermostat'],
      ['Outlet', 'app-outlet'],
      ['Fan', 'app-fan'],
      ['Fanv2', 'app-fan'],
      ['AirPurifier', 'app-air-purifier'],
      ['AccessCode', 'app-access-code'],
      ['Lightbulb', 'app-lightbulb'],
      ['LightSensor', 'app-light-sensor'],
      ['LockMechanism', 'app-lock-mechanism'],
      ['TemperatureSensor', 'app-temperature-sensor'],
      ['GarageDoorOpener', 'app-garage-door-opener'],
      ['MotionSensor', 'app-motion-sensor'],
      ['OccupancySensor', 'app-occupancy-sensor'],
      ['ContactSensor', 'app-contact-sensor'],
      ['HumiditySensor', 'app-humidity-sensor'],
      ['AirQualitySensor', 'app-air-quality-sensor'],
      ['WindowCovering', 'app-window-covering'],
      ['Window', 'app-window'],
      ['Door', 'app-door'],
      ['Television', 'app-television'],
      ['Battery', 'app-battery'],
      ['BatteryService', 'app-battery'],
      ['Speaker', 'app-speaker'],
      ['SmartSpeaker', 'app-speaker'],
      ['Doorbell', 'app-doorbell'],
      ['Microphone', 'app-microphone'],
      ['SecuritySystem', 'app-security-system'],
      ['LeakSensor', 'app-leak-sensor'],
      ['SmokeSensor', 'app-smoke-sensor'],
      ['CarbonMonoxideSensor', 'app-carbon-monoxide-sensor'],
      ['CarbonDioxideSensor', 'app-carbon-dioxide-sensor'],
      ['Valve', 'app-valve'],
      ['IrrigationSystem', 'app-irrigation-system'],
      ['HeaterCooler', 'app-heater-cooler'],
      ['Heater', 'app-heater-cooler'],
      ['Cooler', 'app-heater-cooler'],
      ['HumidifierDehumidifier', 'app-humidifier-dehumidifier'],
      ['Humidifier', 'app-humidifier-dehumidifier'],
      ['Dehumidifier', 'app-humidifier-dehumidifier'],
      ['StatelessProgrammableSwitch', 'app-stateless-programmable-switch'],
      ['FilterMaintenance', 'app-filter-maintenance'],
      ['RobotVacuum', 'app-robot-vacuum'],
      ['WashingMachine', 'app-washing-machine'],
    ])('shows %s as %s', (type, selector) => {
      expect(renderedType(render(hapService({ type })))).toBe(selector)
    })

    it('falls back to the unknown tile for a type it does not handle', () => {
      expect(renderedType(render(hapService({ type: 'SomeNewService' })))).toBe('app-unknown')
    })

    it.each([
      ['Heater', 'heater'],
      ['Cooler', 'cooler'],
    ])('tells the shared heater cooler tile that %s is a %s', (type, expected) => {
      const element = render(hapService({ type }))

      // One component serves three service types, and only this attribute
      // tells it which face to show
      expect(element.querySelector('app-heater-cooler')?.getAttribute('type')).toBe(expected)
    })

    it.each([
      ['Humidifier', 'humidifier'],
      ['Dehumidifier', 'dehumidifier'],
    ])('tells the shared humidifier tile that %s is a %s', (type, expected) => {
      const element = render(hapService({ type }))

      expect(element.querySelector('app-humidifier-dehumidifier')?.getAttribute('type')).toBe(expected)
    })
  })

  describe('matter accessories', () => {
    it.each([
      ['OnOffLight', 'app-on-off-light'],
      ['DimmableLight', 'app-dimmable-light'],
      ['ColorTemperatureLight', 'app-color-temperature-light'],
      ['ExtendedColorLight', 'app-extended-color-light'],
      ['OnOffPlugInUnit', 'app-on-off-plug-in-unit'],
      ['OnOffLightSwitch', 'app-on-off-light-switch'],
      ['RoboticVacuumCleaner', 'app-robotic-vacuum-cleaner'],
      ['ContactSensor', 'app-matter-contact-sensor'],
      ['OccupancySensor', 'app-matter-occupancy-sensor'],
      ['LightSensor', 'app-matter-light-sensor'],
      ['TemperatureSensor', 'app-matter-temperature-sensor'],
      ['HumiditySensor', 'app-matter-humidity-sensor'],
      ['SmokeCoAlarm', 'app-matter-smoke-co-alarm'],
      ['WaterLeakDetector', 'app-matter-water-leak-detector'],
      ['AirQualitySensor', 'app-matter-air-quality-sensor'],
      ['DoorLock', 'app-matter-door-lock'],
      ['WindowCovering', 'app-matter-window-covering'],
      ['Door', 'app-matter-window-covering'],
      ['Window', 'app-matter-window-covering'],
      ['Fan', 'app-matter-fan'],
      ['Thermostat', 'app-matter-thermostat'],
      ['RoomAirConditioner', 'app-matter-thermostat'],
      ['GenericSwitch', 'app-matter-generic-switch'],
      ['WaterValve', 'app-matter-water-valve'],
      ['Pump', 'app-matter-pump'],
    ])('shows %s as %s', (deviceType, selector) => {
      expect(renderedType(render(matterService({ deviceType })))).toBe(selector)
    })

    it('falls back to the unknown tile for a device type it does not handle', () => {
      expect(renderedType(render(matterService({ deviceType: 'SomeNewDevice' })))).toBe('app-matter-unknown')
    })

    it('uses the matter tiles even when the device type also exists in hap', () => {
      // Both protocols have a 'ContactSensor', so picking the branch by
      // protocol rather than by name is what keeps them apart
      const element = render(matterService({ deviceType: 'ContactSensor' }))

      expect(renderedType(element)).toBe('app-matter-contact-sensor')
    })
  })

  describe('a user chosen type', () => {
    it('overrides the hap service type', () => {
      const service = hapService({ type: 'Switch', overrides: { customType: 'Outlet' } })

      // The accessory info modal lets a user re-label a switch as an outlet
      expect(renderedType(render(service))).toBe('app-outlet')
    })

    it('overrides the matter device type', () => {
      const service = matterService({ deviceType: 'OnOffLight', overrides: { customType: 'OnOffPlugInUnit' } })

      expect(renderedType(render(service))).toBe('app-on-off-plug-in-unit')
    })

    it('still falls back when the chosen type is not handled', () => {
      const service = hapService({ type: 'Switch', overrides: { customType: 'NotAThing' } })

      expect(renderedType(render(service))).toBe('app-unknown')
    })
  })

  describe('the header button', () => {
    it('offers the accessory menu once hap is ready', () => {
      const element = render(hapService())

      expect(element.querySelector('.manage-accessory-button')).not.toBeNull()
      expect(element.querySelector('.refreshing-accessory-button')).toBeNull()
    })

    it('shows a spinner while hap is still connecting', () => {
      accessories.hapReadyForControl = false

      const element = render(hapService())

      expect(element.querySelector('.refreshing-accessory-button')).not.toBeNull()
    })

    it('reads the matter readiness for a matter accessory', () => {
      // A matter accessory must not be gated on the hap connection, and the
      // two protocols come up independently
      accessories.hapReadyForControl = false
      accessories.matterReadyForControl = true

      const element = render(matterService())

      expect(element.querySelector('.manage-accessory-button')).not.toBeNull()
    })

    it('shows a spinner while matter is still connecting', () => {
      accessories.matterReadyForControl = false

      const element = render(matterService())

      expect(element.querySelector('.refreshing-accessory-button')).not.toBeNull()
    })

    it.each([
      ['ready', true, '.manage-accessory-button'],
      ['connecting', false, '.refreshing-accessory-button'],
    ])('opens the accessory details from the %s button', (_state, ready, selector) => {
      accessories.hapReadyForControl = ready
      const service = hapService()
      const element = render(service)

      element.querySelector<HTMLButtonElement>(selector)!.click()

      expect(accessories.showAccessoryInformation).toHaveBeenCalledWith(service)
    })

    it('marks a hidden accessory', () => {
      const element = render(hapService({ overrides: { hidden: true } }))

      expect(element.querySelector('.accessory-hidden-indicator')).not.toBeNull()
      expect(element.querySelector('.accessory-hidden-icon')).not.toBeNull()
    })
  })
})
