import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import type { AccessoriesService } from '@/app/core/accessories/accessories.service'
import type { FakeModalService, FakeSettings } from '@/testing'
import type { CharacteristicType } from '@homebridge/hap-client'

import { DecimalPipe, LowerCasePipe, UpperCasePipe } from '@angular/common'
import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslatePipe } from '@ngx-translate/core'
import { describe, expect, it, vi } from 'vitest'

import { AccessoriesService as AccessoriesServiceToken } from '@/app/core/accessories/accessories.service'
import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { AirPurifierComponent } from '@/app/core/accessories/types/hap/air-purifier/air-purifier.component'
import { DoorComponent } from '@/app/core/accessories/types/hap/door/door.component'
import { DoorbellComponent } from '@/app/core/accessories/types/hap/doorbell/doorbell.component'
import { DoorbellManageComponent } from '@/app/core/accessories/types/hap/doorbell/doorbell.manage.component'
import { FanComponent } from '@/app/core/accessories/types/hap/fan/fan.component'
import { FilterMaintenanceComponent } from '@/app/core/accessories/types/hap/filter-maintenance/filter-maintenance.component'
import { GarageDoorOpenerComponent } from '@/app/core/accessories/types/hap/garage-door-opener/garage-door-opener.component'
import { HeaterCoolerComponent } from '@/app/core/accessories/types/hap/heater-cooler/heater-cooler.component'
import { HumidifierDehumidifierComponent } from '@/app/core/accessories/types/hap/humidifier-dehumidifier/humidifier-dehumidifier.component'
import { LightbulbComponent } from '@/app/core/accessories/types/hap/lightbulb/lightbulb.component'
import { LockMechanismComponent } from '@/app/core/accessories/types/hap/lock-mechanism/lock-mechanism.component'
import { MicrophoneComponent } from '@/app/core/accessories/types/hap/microphone/microphone.component'
import { MicrophoneManageComponent } from '@/app/core/accessories/types/hap/microphone/microphone.manage.component'
import { OutletComponent } from '@/app/core/accessories/types/hap/outlet/outlet.component'
import { RobotVacuumComponent } from '@/app/core/accessories/types/hap/robot-vacuum/robot-vacuum.component'
import { SecuritySystemComponent } from '@/app/core/accessories/types/hap/security-system/security-system.component'
import { SpeakerComponent } from '@/app/core/accessories/types/hap/speaker/speaker.component'
import { SpeakerManageComponent } from '@/app/core/accessories/types/hap/speaker/speaker.manage.component'
import { SwitchComponent } from '@/app/core/accessories/types/hap/switch/switch.component'
import { TelevisionComponent } from '@/app/core/accessories/types/hap/television/television.component'
import { ThermostatComponent } from '@/app/core/accessories/types/hap/thermostat/thermostat.component'
import { ValveComponent } from '@/app/core/accessories/types/hap/valve/valve.component'
import { WashingMachineComponent } from '@/app/core/accessories/types/hap/washing-machine/washing-machine.component'
import { WindowCoveringComponent } from '@/app/core/accessories/types/hap/window-covering/window-covering.component'
import { WindowComponent } from '@/app/core/accessories/types/hap/window/window.component'
import { ConvertMiredPipe } from '@/app/core/pipes/convert-mired.pipe'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { DurationPipe } from '@/app/core/pipes/duration.pipe'
import { characteristic, hapService, makeSettings, modalServiceSpy, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The HAP accessory tiles — the thing you actually tap on the accessories page.
 *
 * The whole of the rest of the suite is about modals and services; these are the
 * 22 interactive tiles, and they share one rule that matters more than anything
 * else they do:
 *
 * ⚠️ **A tap must do nothing until the bridge is ready for control.** Before that
 * point the socket has no route to the accessory, so the write is dropped — but
 * the tile has already flipped itself to look as though it worked, and the user
 * is left staring at a light that says on and isn't. The first block asserts that
 * guard on **every** tile, along with which characteristic each one reaches for,
 * so a new tile added without the guard fails immediately.
 */
describe('the HAP accessory tiles', () => {
  let modal: FakeModalService
  let settings: FakeSettings
  let accessories: AccessoriesService

  /**
   * Build a tile.
   *
   * The templates are dropped down to `NO_ERRORS_SCHEMA` plus the pipes they
   * format with — the tiles' own SVG and layout is not what these assert.
   * @param type - the tile component
   * @param service - the accessory service it renders
   * @param readyForControl - whether the bridge is ready to accept writes
   */
  function create<T>(type: new (...args: any[]) => T, service: ServiceTypeX, readyForControl = true): T {
    return build(type, service, readyForControl).componentInstance as T
  }

  /** The shared half of `create` / `createTile`: returns the fixture itself. */
  function build<T>(type: new (...args: any[]) => T, service: ServiceTypeX, readyForControl: boolean) {
    TestBed.resetTestingModule()
    modal = modalServiceSpy()
    settings = makeSettings()
    accessories = { accessoryData: { subscribe: vi.fn() } } as unknown as AccessoriesService

    TestBed.configureTestingModule({
      imports: [type as any],
      providers: [
        provideTestTranslate(),
        provideFakes({ modal, settings, toastr: toastrStub() }),
        { provide: AccessoriesServiceToken, useValue: accessories },
      ],
    })

    TestBed.overrideComponent(type as any, {
      set: {
        imports: [TranslatePipe, LowerCasePipe, UpperCasePipe, DecimalPipe, ConvertTempPipe, ConvertMiredPipe, DurationPipe],
        schemas: [NO_ERRORS_SCHEMA],
      },
    })

    const fixture = TestBed.createComponent(type as any)
    fixture.componentRef.setInput('service', service)
    fixture.componentRef.setInput('readyForControl', readyForControl)
    fixture.detectChanges()
    return fixture
  }

  /** Every `setValue` call on a service, in the order they happened. */
  function writesTo(service: ServiceTypeX) {
    return service.serviceCharacteristics
      .flatMap((char) => {
        const spy = vi.mocked(char.setValue!)
        return spy.mock.calls.map((call, index) => ({
          type: char.type,
          value: call[0],
          order: spy.mock.invocationCallOrder[index],
        }))
      })
      .sort((first, second) => first.order - second.order)
      .map(({ type, value }) => ({ type, value }))
  }

  /**
   * A service carrying exactly the characteristics a case names.
   * @param chars - the characteristics, as name / value / optional-overrides
   * tuples. The overrides matter where a tile reads metadata rather than the
   * value: the lightbulb reads `maxValue` off Brightness.
   */
  function serviceWith(chars: Array<[string, any] | [string, any, Partial<CharacteristicType>]>): ServiceTypeX {
    return hapService({
      characteristics: chars.map(([type, value, overrides]) => characteristic(type, value, overrides)) as CharacteristicType[],
    })
  }

  /**
   * Build a tile and keep hold of its fixture, for the specs that need to feed
   * it a second service - the garage door tracks state across updates.
   * @param type - the tile component
   * @param service - the first accessory service it renders
   */
  function createTile<T>(type: new (...args: any[]) => T, service: ServiceTypeX) {
    const fixture = build(type, service, true)
    let current = service
    return {
      component: fixture.componentInstance as T,
      currentService: () => current,
      setService: (next: ServiceTypeX) => {
        current = next
        fixture.componentRef.setInput('service', next)
        fixture.detectChanges()
      },
    }
  }

  interface TileCase {
    name: string
    type: new (...args: any[]) => { onClick: () => void }
    chars: Array<[string, any]>
    /** The characteristic and value a tap should write, once ready. */
    write: [string, any]
  }

  interface ModalTileCase {
    name: string
    type: new (...args: any[]) => { onClick: () => void }
    chars: Array<[string, any]>
  }

  // Every interactive tile, with the characteristic a plain tap reaches for.
  // Sixteen of them fall through to `On`; the three position tiles have no
  // on/off at all; three open a modal instead of writing anything.
  const TILES: TileCase[] = [
    { name: 'switch', type: SwitchComponent, chars: [['On', false]], write: ['On', true] },
    { name: 'outlet', type: OutletComponent, chars: [['On', false]], write: ['On', true] },
    { name: 'lightbulb', type: LightbulbComponent, chars: [['On', false]], write: ['On', true] },
    { name: 'fan', type: FanComponent, chars: [['On', false]], write: ['On', true] },
    { name: 'valve', type: ValveComponent, chars: [['On', false]], write: ['On', true] },
    { name: 'air purifier', type: AirPurifierComponent, chars: [['On', false]], write: ['On', true] },
    { name: 'heater cooler', type: HeaterCoolerComponent, chars: [['On', false]], write: ['On', true] },
    { name: 'humidifier', type: HumidifierDehumidifierComponent, chars: [['On', false]], write: ['On', true] },
    { name: 'television', type: TelevisionComponent, chars: [['On', false]], write: ['On', true] },
    { name: 'speaker', type: SpeakerComponent, chars: [['On', false]], write: ['On', true] },
    { name: 'microphone', type: MicrophoneComponent, chars: [['On', false]], write: ['On', true] },
    { name: 'doorbell', type: DoorbellComponent, chars: [['On', false]], write: ['On', true] },
    { name: 'robot vacuum', type: RobotVacuumComponent, chars: [['On', false]], write: ['On', true] },
    { name: 'washing machine', type: WashingMachineComponent, chars: [['On', false]], write: ['On', true] },
    { name: 'garage door opener', type: GarageDoorOpenerComponent, chars: [['On', false]], write: ['On', true] },
    { name: 'lock mechanism', type: LockMechanismComponent, chars: [['On', false]], write: ['On', true] },
    { name: 'door', type: DoorComponent, chars: [['TargetPosition', 0]], write: ['TargetPosition', 100] },
    { name: 'window', type: WindowComponent, chars: [['TargetPosition', 0]], write: ['TargetPosition', 100] },
    { name: 'window covering', type: WindowCoveringComponent, chars: [['TargetPosition', 0]], write: ['TargetPosition', 100] },
  ]

  // Three tiles have nothing to toggle, so a tap opens their manage modal
  const MODAL_TILES: ModalTileCase[] = [
    { name: 'thermostat', type: ThermostatComponent, chars: [['TargetTemperature', 21], ['CurrentTemperature', 20]] },
    { name: 'security system', type: SecuritySystemComponent, chars: [['SecuritySystemTargetState', 3]] },
    { name: 'filter maintenance', type: FilterMaintenanceComponent, chars: [['FilterChangeIndication', 0]] },
  ]

  describe.each(TILES.map(tile => [tile.name, tile] as const))('the %s tile', (_name, tile) => {
    it('writes nothing until the bridge is ready for control', () => {
      const service = serviceWith(tile.chars)
      const component = create(tile.type, service, false)

      component.onClick()

      expect(writesTo(service)).toEqual([])
    })

    it('writes on a tap once the bridge is ready', () => {
      const service = serviceWith(tile.chars)
      const component = create(tile.type, service, true)

      component.onClick()

      expect(writesTo(service)).toEqual([{ type: tile.write[0], value: tile.write[1] }])
    })
  })

  describe.each(MODAL_TILES.map(tile => [tile.name, tile] as const))('the %s tile', (_name, tile) => {
    it('opens nothing until the bridge is ready for control', () => {
      const component = create(tile.type, serviceWith(tile.chars), false)

      component.onClick()

      expect(modal.opened).toEqual([])
    })

    it('opens its manage modal on a tap once the bridge is ready', () => {
      const service = serviceWith(tile.chars)
      const component = create(tile.type, service, true)

      component.onClick()

      expect(modal.opened).toHaveLength(1)
      expect(writesTo(service)).toEqual([])
    })
  })

  // switch and outlet are copies of one another, and carry the longest
  // precedence chain in the app: one tile stands in for any accessory a plugin
  // exposed as a generic switch, whatever it actually is underneath
  describe.each([
    ['switch', SwitchComponent as new (...args: any[]) => SwitchComponent],
    ['outlet', OutletComponent as unknown as new (...args: any[]) => SwitchComponent],
  ])('the %s tile on an accessory of any kind', (_name, type) => {
    describe('reading whether it is on', () => {
      it.each([
        ['On true', [['On', true]], true],
        ['On false', [['On', false]], false],
        ['Active 1', [['Active', 1]], true],
        ['Active 0', [['Active', 0]], false],
        ['a playing media state', [['CurrentMediaState', 0]], true],
        ['a paused media state', [['CurrentMediaState', 1]], true],
        ['a stopped media state', [['CurrentMediaState', 2]], false],
        ['unmuted with volume', [['Mute', false], ['Volume', 50]], true],
        ['unmuted at zero volume', [['Mute', false], ['Volume', 0]], false],
        ['muted', [['Mute', true], ['Volume', 50]], false],
        ['an unlocked lock', [['LockTargetState', 0]], true],
        ['a locked lock', [['LockTargetState', 1]], false],
        ['an open door', [['CurrentDoorState', 0]], true],
        ['a closing door', [['CurrentDoorState', 2]], true],
        ['a closed door', [['CurrentDoorState', 1]], false],
      ])('reads %s', (_label, chars, expected) => {
        const component = create(type, serviceWith(chars as Array<[string, any]>))

        expect(component.isOn()).toBe(expected)
      })

      it('reads an accessory it cannot interpret as off', () => {
        const component = create(type, serviceWith([['ProgramMode', 0]]))

        expect(component.isOn()).toBe(false)
      })

      it('prefers On over everything else when the accessory has both', () => {
        // The chain is a precedence order, not a set of alternatives
        const component = create(type, serviceWith([['On', true], ['Active', 0]]))

        expect(component.isOn()).toBe(true)
      })
    })

    describe('what a tap writes', () => {
      it.each([
        ['On', [['On', false]], ['On', true]],
        ['On, switching off', [['On', true]], ['On', false]],
        ['Active as a number', [['Active', 0]], ['Active', 1]],
        ['Active back to zero', [['Active', 1]], ['Active', 0]],
        ['a media state', [['TargetMediaState', 0]], ['TargetMediaState', 1]],
        ['Mute', [['Mute', false]], ['Mute', true]],
        ['a lock', [['LockTargetState', 0]], ['LockTargetState', 1]],
        ['a door', [['TargetDoorState', 0]], ['TargetDoorState', 1]],
      ])('writes %s', (_label, chars, expected) => {
        const service = serviceWith(chars as Array<[string, any]>)
        const component = create(type, service)

        component.onClick()

        expect(writesTo(service)).toEqual([{ type: expected[0], value: expected[1] }])
      })

      it('writes nothing at all for an accessory it cannot interpret', () => {
        // Rather than throwing on a null characteristic
        const service = serviceWith([['ProgramMode', 0]])
        const component = create(type, service)

        expect(() => component.onClick()).not.toThrow()
        expect(writesTo(service)).toEqual([])
      })
    })

    describe('power consumption', () => {
      it('shows the reading when the accessory reports one', () => {
        const component = create(type, serviceWith([['On', true], ['Consumption', 42]]))

        expect(component.hasCurrentConsumption()).toBe(true)
        expect(component.currentConsumption()).toBe(42)
      })

      it('shows nothing when it does not', () => {
        const component = create(type, serviceWith([['On', true]]))

        expect(component.hasCurrentConsumption()).toBe(false)
        expect(component.currentConsumption()).toBeUndefined()
      })
    })
  })

  describe('the lightbulb tile', () => {
    it('paints nothing when the bulb is off', () => {
      const component = create(LightbulbComponent, serviceWith([['On', false], ['Hue', 120], ['Saturation', 100]]))

      expect(component.getBulbFill()).toBe('none')
    })

    it('paints a colour bulb in its own hue', () => {
      const component = create(LightbulbComponent, serviceWith([['On', true], ['Hue', 120], ['Saturation', 100]]))

      expect(component.getBulbFill()).toBe('hsl(120, 100%, 50%)')
    })

    it('paints a colour temperature bulb by converting its mireds', () => {
      const component = create(LightbulbComponent, serviceWith([['On', true], ['ColorTemperature', 250]]))

      // 250 mireds is 4000K, a neutral white
      expect(component.getBulbFill()).toMatch(/^hsl\(/)
      expect(component.getBulbFill()).not.toBe('none')
    })

    it('paints a plain white bulb the default warm colour', () => {
      const component = create(LightbulbComponent, serviceWith([['On', true]]))

      expect(component.getBulbFill()).toBe('#ffcf55')
    })

    it('shows the brightness as a percentage while on', () => {
      const component = create(LightbulbComponent, serviceWith([['On', true], ['Brightness', 60]]))

      expect(component.getBrightnessLabel()).toBe('60%')
    })

    it('shows no brightness label while off', () => {
      const component = create(LightbulbComponent, serviceWith([['On', false], ['Brightness', 60]]))

      expect(component.getBrightnessLabel()).toBe('')
    })

    it('adds the power reading to the brightness label', () => {
      const component = create(LightbulbComponent, serviceWith([['On', true], ['Brightness', 60], ['Consumption', 9]]))

      expect(component.getBrightnessLabel()).toContain('60%')
      expect(component.getBrightnessLabel()).toContain('9W')
    })

    it('offers adaptive lighting only to a bulb that supports it', () => {
      const withIt = create(LightbulbComponent, serviceWith([['On', true], ['Brightness', 60], ['CharacteristicValueActiveTransitionCount', 1]]))
      expect(withIt.hasAdaptiveLighting()).toBe(true)
      expect(withIt.isAdaptiveLightingEnabled()).toBe(true)

      const without = create(LightbulbComponent, serviceWith([['On', true], ['Brightness', 60]]))
      expect(without.hasAdaptiveLighting()).toBe(false)
    })

    it('reads adaptive lighting as off when the transition count is zero', () => {
      // The characteristic is present but the feature is not in use
      const component = create(LightbulbComponent, serviceWith([['On', true], ['CharacteristicValueActiveTransitionCount', 0]]))

      expect(component.hasAdaptiveLighting()).toBe(true)
      expect(component.isAdaptiveLightingEnabled()).toBe(false)
    })

    it('marks the adaptive lighting icon as active in the label', () => {
      const component = create(LightbulbComponent, serviceWith([['On', true], ['Brightness', 60], ['CharacteristicValueActiveTransitionCount', 1]]))

      expect(component.getBrightnessLabel()).toContain('on-text')
    })

    it('greys the adaptive lighting icon when it is switched off', () => {
      const component = create(LightbulbComponent, serviceWith([['On', true], ['Brightness', 60], ['CharacteristicValueActiveTransitionCount', 0]]))

      expect(component.getBrightnessLabel()).toContain('grey-text')
    })

    it('moves the slider to full when switching on a bulb sitting at zero', () => {
      // So the long-press modal opens showing a usable brightness
      const service = serviceWith([['On', false], ['Brightness', 0, { maxValue: 100 }]])
      const component = create(LightbulbComponent, service)

      component.onClick()

      expect(service.values.Brightness).toBe(100)
    })

    describe('a long press', () => {
      it('opens the manage modal for a dimmable bulb', async () => {
        const component = create(LightbulbComponent, serviceWith([['On', true], ['Brightness', 60]]))

        await component.onLongClick()

        expect(modal.opened).toHaveLength(1)
        expect(modal.lastOpened()!.options?.backdrop).toBe('static')
      })

      it('opens nothing for a bulb with only on and off', () => {
        // There would be no controls to show
        const component = create(LightbulbComponent, serviceWith([['On', true]]))

        void component.onLongClick()

        expect(modal.opened).toEqual([])
      })

      it('opens nothing until the bridge is ready for control', async () => {
        const component = create(LightbulbComponent, serviceWith([['On', true], ['Brightness', 60]]), false)

        await component.onLongClick()

        expect(modal.opened).toEqual([])
      })
    })
  })

  describe('the garage door opener tile', () => {
    // HAP CurrentDoorState: 0 open, 1 closed, 2 opening, 3 closing, 4 stopped.
    // TargetDoorState: 0 open, 1 closed. A tap always means "do the opposite of
    // what you are doing", which is not the same as "toggle the target"
    function garage(current: number) {
      return serviceWith([['CurrentDoorState', current], ['TargetDoorState', 1]])
    }

    it.each([
      ['a closed door opens', 1, 0],
      ['a closing door reopens', 3, 0],
      ['an open door closes', 0, 1],
      ['an opening door closes', 2, 1],
    ])('%s', (_label, currentState, expected) => {
      const service = garage(currentState)
      const component = create(GarageDoorOpenerComponent, service)

      component.onClick()

      expect(writesTo(service)).toEqual([{ type: 'TargetDoorState', value: expected }])
    })

    it('reverses a door that was stopped part way while closing', () => {
      // A stopped door reports neither direction, so the tile has to remember
      // which way it was last going - reversing is what the user expects
      const service = garage(3)
      const fixture = createTile(GarageDoorOpenerComponent, service)

      // It was closing, then the user stopped it
      fixture.setService(garage(4))
      fixture.component.onClick()

      expect(writesTo(fixture.currentService())).toEqual([{ type: 'TargetDoorState', value: 0 }])
    })

    it('reverses a door that was stopped part way while opening', () => {
      const service = garage(2)
      const fixture = createTile(GarageDoorOpenerComponent, service)

      fixture.setService(garage(4))
      fixture.component.onClick()

      expect(writesTo(fixture.currentService())).toEqual([{ type: 'TargetDoorState', value: 1 }])
    })

    it('closes a door stopped before it ever moved', () => {
      // Nothing to reverse, so it falls through to the default
      const service = garage(4)
      const component = create(GarageDoorOpenerComponent, service)

      component.onClick()

      expect(writesTo(service)).toEqual([{ type: 'TargetDoorState', value: 1 }])
    })

    it('flags a door that resumed moving after being stopped', () => {
      // The tile shows a different animation for a resumed door
      const fixture = createTile(GarageDoorOpenerComponent, garage(4))
      expect(fixture.component.fromStopped()).toBe(false)

      fixture.setService(garage(3))

      expect(fixture.component.fromStopped()).toBe(true)
    })

    it('does not flag a door that started moving from rest', () => {
      const fixture = createTile(GarageDoorOpenerComponent, garage(1))

      fixture.setService(garage(2))

      expect(fixture.component.fromStopped()).toBe(false)
    })

    it('falls back to On for an opener with no door state at all', () => {
      const service = serviceWith([['On', false]])
      const component = create(GarageDoorOpenerComponent, service)

      component.onClick()

      expect(writesTo(service)).toEqual([{ type: 'On', value: true }])
    })
  })

  describe('the door and window tiles', () => {
    describe.each([
      ['door', DoorComponent as new (...args: any[]) => DoorComponent],
      ['window', WindowComponent as unknown as new (...args: any[]) => DoorComponent],
      ['window covering', WindowCoveringComponent as unknown as new (...args: any[]) => DoorComponent],
    ])('the %s tile', (_name, type) => {
      it('closes one that is open at all', () => {
        const service = serviceWith([['TargetPosition', 40]])
        const component = create(type, service)

        component.onClick()

        expect(writesTo(service)).toEqual([{ type: 'TargetPosition', value: 0 }])
      })

      it('opens one that is fully closed', () => {
        const service = serviceWith([['TargetPosition', 0]])
        const component = create(type, service)

        component.onClick()

        expect(writesTo(service)).toEqual([{ type: 'TargetPosition', value: 100 }])
      })
    })
  })

  /**
   * The media tiles: speaker, microphone, doorbell and valve.
   *
   * ⚠️ **These four have no single characteristic to toggle.** A speaker can
   * report `On`, `Active`, a media state, or only a mute flag, depending on the
   * plugin — so each one walks a fallback chain, and a tile that picks the wrong
   * rung either writes to a characteristic the accessory does not have (nothing
   * happens) or reads the wrong one and shows the opposite of the truth.
   */
  describe('the media tiles and their fallbacks', () => {
    /**
     * ⚠️ Speaker, microphone and doorbell are the **same component three times
     * over** — byte-identical apart from their class names, one `styleUrl` and the
     * manage modal each opens. The table below therefore runs over all three, so
     * they cannot quietly drift apart.
     */
    const MEDIA_TILES: Array<[string, new (...args: any[]) => { onClick: () => void }, unknown]> = [
      ['speaker', SpeakerComponent, SpeakerManageComponent],
      ['microphone', MicrophoneComponent, MicrophoneManageComponent],
      ['doorbell', DoorbellComponent, DoorbellManageComponent],
    ]

    describe.each(MEDIA_TILES)('whether a %s reads as on', (_name, tile) => {
      /**
       * What the tile makes of a set of characteristics.
       * @param chars - the characteristics the accessory reports
       */
      function isOn(chars: Array<[string, any]>): boolean {
        return (create(tile, serviceWith(chars)) as any).isOn()
      }

      it('follows On when it has one', () => {
        expect(isOn([['On', true]])).toBe(true)
        expect(isOn([['On', false]])).toBe(false)
      })

      it('prefers On over everything else', () => {
        // A speaker with both should not be read by its mute flag
        expect(isOn([['On', false], ['Mute', false], ['Volume', 50]])).toBe(false)
      })

      it('falls back to Active', () => {
        expect(isOn([['Active', 1]])).toBe(true)
        expect(isOn([['Active', 0]])).toBe(false)
      })

      it.each([
        ['playing', 0, true],
        ['paused', 1, true],
        ['stopped', 2, false],
        ['unknown', 3, false],
      ])('reads a %s media state as on: %s', (_label, state, expected) => {
        // Paused still counts as on: the speaker is in use
        expect(isOn([['CurrentMediaState', state]])).toBe(expected)
      })

      it('reads an unmuted speaker with volume as on', () => {
        expect(isOn([['Mute', false], ['Volume', 30]])).toBe(true)
      })

      it('reads an unmuted speaker turned all the way down as off', () => {
        // Nothing is coming out of it
        expect(isOn([['Mute', false], ['Volume', 0]])).toBe(false)
      })

      it('reads a muted speaker as off', () => {
        expect(isOn([['Mute', true], ['Volume', 50]])).toBe(false)
      })

      it('reads a mute-only speaker by its mute flag', () => {
        expect(isOn([['Mute', false]])).toBe(true)
        expect(isOn([['Mute', true]])).toBe(false)
      })

      it('reads a speaker that reports nothing useful as off', () => {
        expect(isOn([['Name', 'Speaker']])).toBe(false)
      })
    })

    describe.each(MEDIA_TILES)('what a tap on a %s writes', (_name, tile) => {
      it.each([
        ['On', [['On', true]], { type: 'On', value: false }],
        ['Active', [['Active', 0]], { type: 'Active', value: 1 }],
        ['the target media state', [['TargetMediaState', 0]], { type: 'TargetMediaState', value: 1 }],
        ['the mute flag', [['Mute', false]], { type: 'Mute', value: true }],
      ])('writes %s', (_label, chars, expected) => {
        const service = serviceWith(chars as Array<[string, any]>)

        create(tile, service).onClick()

        expect(writesTo(service)).toEqual([expected])
      })

      it('turns a playing one off through the media state', () => {
        const service = serviceWith([['TargetMediaState', 0]])

        create(tile, service).onClick()

        expect(writesTo(service)).toEqual([{ type: 'TargetMediaState', value: 1 }])
      })

      it('writes nothing at all when it has no control', () => {
        const service = serviceWith([['CurrentMediaState', 0]])

        create(tile, service).onClick()

        expect(writesTo(service)).toEqual([])
      })
    })

    describe.each(MEDIA_TILES)('the %s manage modal', (_name, tile, manageModal) => {
      it.each([
        ['a volume control', [['Mute', false], ['Volume', 40]]],
        ['an active flag', [['Active', 1]]],
        ['a media state to set', [['TargetMediaState', 0]]],
        ['nothing but a mute flag', [['Mute', false]]],
      ])('opens on a long press for one with %s', (_label, chars) => {
        const component = create(tile, serviceWith(chars as Array<[string, any]>)) as any

        component.onLongClick()

        expect(modal.opened).toHaveLength(1)
        expect(modal.lastOpened()!.options).toMatchObject({ size: 'md', backdrop: 'static' })
      })

      it('opens its own manage modal, not another tile one', () => {
        // The only thing that differs between these three components
        const component = create(tile, serviceWith([['Active', 1]])) as any

        component.onLongClick()

        expect(modal.lastOpened()!.content).toBe(manageModal)
      })

      it('opens nothing for a plain on/off accessory', () => {
        // There is nothing in the modal to show
        const component = create(tile, serviceWith([['On', true]])) as any

        component.onLongClick()

        expect(modal.opened).toEqual([])
      })

      it('opens nothing before the bridge is ready', () => {
        const component = create(tile, serviceWith([['Active', 1]]), false) as any

        component.onLongClick()

        expect(modal.opened).toEqual([])
      })
    })

    describe('the valve countdown', () => {
      /** A valve that runs on a timer. */
      function timedValve(active: number, remaining: number) {
        return serviceWith([['Active', active], ['SetDuration', 600], ['RemainingDuration', remaining]])
      }

      it('counts down while the valve is running', async () => {
        vi.useFakeTimers()
        const component = create(ValveComponent, timedValve(1, 125)) as any

        await vi.advanceTimersByTimeAsync(5000)

        // 125 seconds less the 5 that have passed
        expect(component.remainingDuration()).toBe('02:00')
        vi.useRealTimers()
      })

      it('shows hours when there are hours left', async () => {
        vi.useFakeTimers()
        const component = create(ValveComponent, timedValve(1, 7200)) as any

        await vi.advanceTimersByTimeAsync(1000)

        expect(component.remainingDuration()).toBe('01:59:59')
        vi.useRealTimers()
      })

      it('counts nothing while the valve is off', async () => {
        vi.useFakeTimers()
        const component = create(ValveComponent, timedValve(0, 600)) as any

        await vi.advanceTimersByTimeAsync(5000)

        expect(component.remainingDuration()).toBe('')
        vi.useRealTimers()
      })

      it('clears the countdown once the time is up', async () => {
        vi.useFakeTimers()
        const component = create(ValveComponent, timedValve(1, 2)) as any

        await vi.advanceTimersByTimeAsync(3000)

        expect(component.remainingDuration()).toBe('')
        vi.useRealTimers()
      })

      it('starts no countdown for a valve with no duration setting', async () => {
        // A plain on/off valve; there is nothing to count
        vi.useFakeTimers()
        const component = create(ValveComponent, serviceWith([['Active', 1]])) as any

        await vi.advanceTimersByTimeAsync(5000)

        expect(component.secondsActive).toBe(0)
        vi.useRealTimers()
      })
    })

    describe('what a valve tile shows and writes', () => {
      it('writes the active flag when it has one', () => {
        const service = serviceWith([['Active', 0]])

        create(ValveComponent, service).onClick()

        expect(writesTo(service)).toEqual([{ type: 'Active', value: 1 }])
      })

      it('turns a running valve off', () => {
        const service = serviceWith([['Active', 1]])

        create(ValveComponent, service).onClick()

        expect(writesTo(service)).toEqual([{ type: 'Active', value: 0 }])
      })

      it('reports the consumption of a valve that measures it', () => {
        const component = create(ValveComponent, serviceWith([['Active', 1], ['Consumption', 12.5]])) as any

        expect(component.hasCurrentConsumption()).toBe(true)
        expect(component.currentConsumption()).toBe(12.5)
      })

      it('reports nothing for a valve that does not measure it', () => {
        const component = create(ValveComponent, serviceWith([['Active', 1]])) as any

        expect(component.hasCurrentConsumption()).toBe(false)
        expect(component.currentConsumption()).toBeUndefined()
      })

      it('opens its manage modal on a long press when it has a duration', () => {
        const component = create(ValveComponent, serviceWith([['Active', 1], ['SetDuration', 600]])) as any

        component.onLongClick()

        expect(modal.opened).toHaveLength(1)
      })

      it('opens nothing on a valve with no duration', () => {
        const component = create(ValveComponent, serviceWith([['Active', 1]])) as any

        component.onLongClick()

        expect(modal.opened).toEqual([])
      })
    })
  })

  /**
   * The four tiles with a state of their own beyond on/off.
   *
   * ⚠️ **A tile reads and writes different characteristics depending on what the
   * plugin published.** A fan may have `On` or `Active`; a lock has
   * `LockTargetState` and inverts it; an air purifier is "on" but not necessarily
   * "purifying". Reading the wrong one shows the opposite of the truth, and writing
   * the wrong one does nothing at all.
   */
  describe('the tiles with state of their own', () => {
    describe('the fan', () => {
      it('shows a percentage unit when the accessory reports one', () => {
        const service = serviceWith([['On', true], ['RotationSpeed', 50, { unit: 'percentage' }]])

        expect((create(FanComponent, service) as any).rotationSpeedUnit).toBe('%')
      })

      it('shows no unit when the accessory does not say', () => {
        const service = serviceWith([['On', true], ['RotationSpeed', 3]])

        expect((create(FanComponent, service) as any).rotationSpeedUnit).toBe('')
      })

      it('knows whether the fan can reverse', () => {
        const withDirection = serviceWith([['On', true], ['RotationDirection', 0]])
        const without = serviceWith([['On', true]])

        expect((create(FanComponent, withDirection) as any).hasRotationDirection).toBe(true)
        expect((create(FanComponent, without) as any).hasRotationDirection).toBe(false)
      })

      it('winds a fan left at zero up to full when it is switched on', () => {
        // ⚠️ Otherwise the fan reports itself on and does not move, because the
        // speed it was left at is 0
        const service = serviceWith([['On', false], ['RotationSpeed', 0, { maxValue: 100 }]])

        create(FanComponent, service).onClick()

        expect(service.values.RotationSpeed).toBe(100)
      })

      it('leaves a speed the fan already had alone', () => {
        const service = serviceWith([['On', false], ['RotationSpeed', 40, { maxValue: 100 }]])

        create(FanComponent, service).onClick()

        expect(service.values.RotationSpeed).toBe(40)
      })

      it('leaves the speed alone when switching a running fan off', () => {
        const service = serviceWith([['On', true], ['RotationSpeed', 0, { maxValue: 100 }]])

        create(FanComponent, service).onClick()

        expect(service.values.RotationSpeed).toBe(0)
      })

      it('writes the active flag on a fan that has one instead', () => {
        const service = serviceWith([['Active', 1]])

        create(FanComponent, service).onClick()

        expect(writesTo(service)).toEqual([{ type: 'Active', value: 0 }])
      })

      it.each([
        ['a speed control', [['On', true], ['RotationSpeed', 50]]],
        ['a direction control', [['On', true], ['RotationDirection', 0]]],
      ])('opens its modal on a long press for a fan with %s', (_label, chars) => {
        const component = create(FanComponent, serviceWith(chars as Array<[string, any]>)) as any

        component.onLongClick()

        expect(modal.opened).toHaveLength(1)
      })

      it('opens nothing for a plain on/off fan', () => {
        const component = create(FanComponent, serviceWith([['On', true]])) as any

        component.onLongClick()

        expect(modal.opened).toEqual([])
      })
    })

    describe('the television', () => {
      /**
       * A television with input sources linked to it.
       * @param inputs - the inputs, as identifier and name
       */
      function television(inputs: Array<[number, string | undefined]>) {
        const linkedServices = Object.fromEntries(inputs.map(([identifier, name], index) => [
          `input-${index}`,
          hapService({
            type: 'InputSource',
            characteristics: [
              characteristic('Identifier', identifier),
              ...(name === undefined ? [] : [characteristic('ConfiguredName', name)]),
            ],
          }),
        ]))
        return hapService({
          type: 'Television',
          characteristics: [characteristic('Active', 1)],
          overrides: { linkedServices } as any,
        })
      }

      it('lists the inputs by the name they were given', () => {
        const component = create(TelevisionComponent, television([[1, 'HDMI 1'], [2, 'Apple TV']])) as any

        expect(component.channelList).toEqual({ 1: 'HDMI 1', 2: 'Apple TV' })
      })

      it('names an unnamed input after its number', () => {
        // Better than a blank entry in the input list
        const component = create(TelevisionComponent, television([[3, undefined]])) as any

        expect(component.channelList).toEqual({ 3: 'Input 3' })
      })

      it('ignores linked services that are not inputs', () => {
        const service = television([[1, 'HDMI 1']])
        ;(service as any).linkedServices.speaker = hapService({ type: 'Speaker' })

        expect(Object.keys((create(TelevisionComponent, service) as any).channelList)).toEqual(['1'])
      })

      it('has no input list when nothing is linked', () => {
        const component = create(TelevisionComponent, serviceWith([['Active', 1]])) as any

        expect(component.channelList).toEqual({})
      })

      it('prefers the active flag over on', () => {
        const service = serviceWith([['Active', 1], ['On', true]])

        create(TelevisionComponent, service).onClick()

        expect(writesTo(service)).toEqual([{ type: 'Active', value: 0 }])
      })

      it('opens its modal for a television with inputs', () => {
        const component = create(TelevisionComponent, television([[1, 'HDMI 1']])) as any

        component.onLongClick()

        expect(modal.opened).toHaveLength(1)
      })

      it('opens nothing for a television with only an on switch', () => {
        const component = create(TelevisionComponent, serviceWith([['On', true]])) as any

        component.onLongClick()

        expect(modal.opened).toEqual([])
      })
    })

    describe('the lock', () => {
      it('locks a lock that is unlocked', () => {
        // ⚠️ 0 is secured and 1 is unsecured, the opposite way round from on/off
        const service = serviceWith([['LockTargetState', 1]])

        create(LockMechanismComponent, service).onClick()

        expect(writesTo(service)).toEqual([{ type: 'LockTargetState', value: 0 }])
      })

      it('unlocks a lock that is locked', () => {
        const service = serviceWith([['LockTargetState', 0]])

        create(LockMechanismComponent, service).onClick()

        expect(writesTo(service)).toEqual([{ type: 'LockTargetState', value: 1 }])
      })

      it('falls back to on for a lock published as a switch', () => {
        const service = serviceWith([['On', false]])

        create(LockMechanismComponent, service).onClick()

        expect(writesTo(service)).toEqual([{ type: 'On', value: true }])
      })

      it('opens its management modal for a real lock', () => {
        const component = create(LockMechanismComponent, serviceWith([['LockTargetState', 0]])) as any

        component.onLongClick()

        expect(modal.opened).toHaveLength(1)
      })

      it('opens nothing for one published as a switch', () => {
        const component = create(LockMechanismComponent, serviceWith([['On', false]])) as any

        component.onLongClick()

        expect(modal.opened).toEqual([])
      })
    })

    describe('the air purifier', () => {
      /**
       * What the tile makes of a set of characteristics.
       * @param chars - the characteristics the accessory reports
       */
      function states(chars: Array<[string, any]>) {
        const component = create(AirPurifierComponent, serviceWith(chars)) as any
        return { on: component.isOn(), purifying: component.isPurifying() }
      }

      it('is on and purifying when active with nothing more to say', () => {
        expect(states([['Active', 1]])).toEqual({ on: true, purifying: true })
      })

      it('is off when not active', () => {
        expect(states([['Active', 0]])).toEqual({ on: false, purifying: false })
      })

      it('is on but idle while active and only circulating', () => {
        // ⚠️ 1 is idle, 2 is purifying. A tile that reads idle as purifying tells
        // the user the air is being cleaned when the fan is merely on
        expect(states([['Active', 1], ['CurrentAirPurifierState', 1]])).toEqual({ on: true, purifying: false })
      })

      it('is on and purifying while active and purifying', () => {
        expect(states([['Active', 1], ['CurrentAirPurifierState', 2]])).toEqual({ on: true, purifying: true })
      })

      it('is off while active but inactive underneath', () => {
        expect(states([['Active', 1], ['CurrentAirPurifierState', 0]])).toEqual({ on: false, purifying: false })
      })

      it('reads a purifier published as a plain switch', () => {
        expect(states([['On', true]])).toEqual({ on: true, purifying: true })
      })

      it('opens its modal when there are modes to choose from', () => {
        const service = serviceWith([['Active', 1], ['TargetAirPurifierState', 1, { validValues: [0, 1] }]])
        const component = create(AirPurifierComponent, service) as any

        component.onLongClick()

        expect(modal.opened).toHaveLength(1)
      })

      it('opens its modal when there is a speed to set', () => {
        const component = create(AirPurifierComponent, serviceWith([['Active', 1], ['RotationSpeed', 50]])) as any

        component.onLongClick()

        expect(modal.opened).toHaveLength(1)
      })

      it('opens nothing when the purifier offers no choices', () => {
        const service = serviceWith([['Active', 1], ['TargetAirPurifierState', 1, { validValues: [] }]])
        const component = create(AirPurifierComponent, service) as any

        component.onLongClick()

        expect(modal.opened).toEqual([])
      })
    })

    describe('the consumption reading these four share', () => {
      it.each([
        ['fan', FanComponent],
        ['television', TelevisionComponent],
        ['lock', LockMechanismComponent],
        ['air purifier', AirPurifierComponent],
      ])('reports what a %s measures', (_name, tile) => {
        const component = create(tile as any, serviceWith([['On', true], ['Consumption', 7.5]])) as any

        expect(component.hasCurrentConsumption()).toBe(true)
        expect(component.currentConsumption()).toBe(7.5)
      })

      it.each([
        ['fan', FanComponent],
        ['television', TelevisionComponent],
        ['lock', LockMechanismComponent],
        ['air purifier', AirPurifierComponent],
      ])('reports nothing for a %s that does not measure it', (_name, tile) => {
        const component = create(tile as any, serviceWith([['On', true]])) as any

        expect(component.hasCurrentConsumption()).toBe(false)
        expect(component.currentConsumption()).toBeUndefined()
      })
    })
  })

  /**
   * The long press and the power reading on the last four tiles.
   *
   * Each of these opens a manage modal only when the accessory actually has
   * something to manage — a heater with no mode to set, or a bulb that is only
   * on/off, would open an empty panel.
   */
  describe('the remaining long presses', () => {
    interface LongPressCase {
      name: string
      type: new (...args: any[]) => any
      /** Characteristics that should open the modal. */
      opens: Array<[string, any]>
      /** Characteristics that should not. */
      opensNothing: Array<[string, any]>
    }

    const CASES: LongPressCase[] = [
      {
        name: 'heater cooler',
        type: HeaterCoolerComponent,
        opens: [['Active', 1], ['TargetHeaterCoolerState', 0]],
        opensNothing: [['Active', 1]],
      },
      {
        name: 'humidifier',
        type: HumidifierDehumidifierComponent,
        opens: [['Active', 1], ['TargetHumidifierDehumidifierState', 1]],
        opensNothing: [['Active', 1]],
      },
      {
        name: 'garage door opener',
        type: GarageDoorOpenerComponent,
        opens: [['TargetDoorState', 1], ['CurrentDoorState', 1]],
        opensNothing: [['On', false]],
      },
      {
        name: 'lightbulb',
        type: LightbulbComponent,
        opens: [['On', true], ['Brightness', 50]],
        opensNothing: [['On', true]],
      },
    ]

    describe.each(CASES.map(c => [c.name, c] as const))('the %s', (_name, testCase) => {
      it('opens its manage modal when there is something to manage', async () => {
        const component = create(testCase.type, serviceWith(testCase.opens))

        await component.onLongClick()

        expect(modal.opened).toHaveLength(1)
        expect(modal.lastOpened()!.options).toMatchObject({ backdrop: 'static' })
      })

      it('opens nothing when there is not', async () => {
        const component = create(testCase.type, serviceWith(testCase.opensNothing))

        await component.onLongClick()

        expect(modal.opened).toEqual([])
      })

      it('opens nothing before the bridge is ready for control', async () => {
        // ⚠️ The same guard as a tap: the modal would write to an accessory the
        // socket has no route to
        const component = create(testCase.type, serviceWith(testCase.opens), false)

        await component.onLongClick()

        expect(modal.opened).toEqual([])
      })

      it('passes the accessory and the service into the modal', async () => {
        const service = serviceWith(testCase.opens)
        const component = create(testCase.type, service)

        await component.onLongClick()

        expect(modal.dataFor(ACCESSORY_MANAGE_MODAL_DATA)?.service).toBe(service)
      })

      it('reports the power it measures', () => {
        const component = create(testCase.type, serviceWith([...testCase.opens, ['Consumption', 42]]))

        expect(component.hasCurrentConsumption()).toBe(true)
        expect(component.currentConsumption()).toBe(42)
      })

      it('reports nothing when it measures no power', () => {
        const component = create(testCase.type, serviceWith(testCase.opens))

        expect(component.hasCurrentConsumption()).toBe(false)
        expect(component.currentConsumption()).toBeUndefined()
      })
    })

    describe('the on/off fallbacks these four use', () => {
      it('switches a heater by its active flag', () => {
        const service = serviceWith([['Active', 1]])

        create(HeaterCoolerComponent, service).onClick()

        expect(writesTo(service)).toEqual([{ type: 'Active', value: 0 }])
      })

      it('switches a humidifier published as a plain switch', () => {
        const service = serviceWith([['On', false]])

        create(HumidifierDehumidifierComponent, service).onClick()

        expect(writesTo(service)).toEqual([{ type: 'On', value: true }])
      })

      it('switches a garage door published with an active flag', () => {
        // No door state at all: some plugins publish an opener as a switch
        const service = serviceWith([['Active', 0]])

        create(GarageDoorOpenerComponent, service).onClick()

        expect(writesTo(service)).toEqual([{ type: 'Active', value: true }])
      })

      it('switches a bulb by its active flag when it has no on', () => {
        const service = serviceWith([['Active', 1]])

        create(LightbulbComponent, service).onClick()

        expect(writesTo(service)).toEqual([{ type: 'Active', value: 0 }])
      })

      it('winds a bulb left at zero brightness up to full', () => {
        // ⚠️ Same trap as the fan: the bulb reports itself on and stays dark
        const service = serviceWith([['On', false], ['Brightness', 0, { maxValue: 100 }]])

        create(LightbulbComponent, service).onClick()

        expect(service.values.Brightness).toBe(100)
      })
    })
  })
})
