import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import type { AccessoriesService } from '@/app/core/accessories/accessories.service'
import type { FakeModalService, FakeSettings } from '@/testing'

import { DecimalPipe, LowerCasePipe, UpperCasePipe } from '@angular/common'
import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslatePipe } from '@ngx-translate/core'
import { describe, expect, it, vi } from 'vitest'

import { AccessoriesService as AccessoriesServiceToken } from '@/app/core/accessories/accessories.service'
import { ColorTemperatureLightComponent } from '@/app/core/accessories/types/matter/color-temperature-light/color-temperature-light.component'
import { DimmableLightComponent } from '@/app/core/accessories/types/matter/dimmable-light/dimmable-light.component'
import { MatterDoorLockComponent } from '@/app/core/accessories/types/matter/door-lock/door-lock.component'
import { ExtendedColorLightComponent } from '@/app/core/accessories/types/matter/extended-color-light/extended-color-light.component'
import { MatterFanComponent } from '@/app/core/accessories/types/matter/fan/fan.component'
import { OnOffLightSwitchComponent } from '@/app/core/accessories/types/matter/on-off-light-switch/on-off-light-switch.component'
import { OnOffLightComponent } from '@/app/core/accessories/types/matter/on-off-light/on-off-light.component'
import { OnOffPlugInUnitComponent } from '@/app/core/accessories/types/matter/on-off-plug-in-unit/on-off-plug-in-unit.component'
import { MatterPumpComponent } from '@/app/core/accessories/types/matter/pump/pump.component'
import { RoboticVacuumCleanerComponent } from '@/app/core/accessories/types/matter/robotic-vacuum-cleaner/robotic-vacuum-cleaner.component'
import { MatterThermostatComponent } from '@/app/core/accessories/types/matter/thermostat/thermostat.component'
import { MatterWaterValveComponent } from '@/app/core/accessories/types/matter/water-valve/water-valve.component'
import { MatterWindowCoveringComponent } from '@/app/core/accessories/types/matter/window-covering/window-covering.component'
import { ConvertMiredPipe } from '@/app/core/pipes/convert-mired.pipe'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { DurationPipe } from '@/app/core/pipes/duration.pipe'
import { makeSettings, matterService, modalServiceSpy, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The matter accessory tiles.
 *
 * These are deliberately thin: each one guards on `readyForControl`, then hands
 * off to a helper in `matter-device.utils.ts`. Those helpers already have their
 * own spec, so **re-asserting the cluster payloads here would be duplication**.
 * What is NOT covered anywhere else, and is the point of this file:
 *
 * ⚠️ **the guard, on every tile and on both gestures.** Matter control runs over
 * the same socket as HAP, and before the bridge reports ready there is no route
 * to the device — the write is dropped while the tile has already flipped itself
 * to look as though it worked.
 *
 * Each row also names the cluster its tile reaches for, which is the one thing a
 * copy-pasted tile gets wrong.
 */
describe('the matter accessory tiles', () => {
  let modal: FakeModalService
  let settings: FakeSettings

  /**
   * Build a tile.
   * @param type - the tile component
   * @param service - the accessory service it renders
   * @param readyForControl - whether the bridge is ready to accept writes
   */
  function create<T>(type: new (...args: any[]) => T, service: ServiceTypeX, readyForControl = true): T {
    TestBed.resetTestingModule()
    modal = modalServiceSpy()
    settings = makeSettings()

    TestBed.configureTestingModule({
      imports: [type as any],
      providers: [
        provideTestTranslate(),
        provideFakes({ modal, settings, toastr: toastrStub() }),
        { provide: AccessoriesServiceToken, useValue: { accessoryData: { subscribe: vi.fn() } } as unknown as AccessoriesService },
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
    return fixture.componentInstance as T
  }

  /** Let a fire-and-forget helper settle. */
  async function settle() {
    for (let tick = 0; tick < 10; tick += 1) {
      await Promise.resolve()
    }
  }

  interface TileCase {
    name: string
    type: new (...args: any[]) => { onClick: () => void }
    clusters: Record<string, Record<string, unknown>>
    /** The cluster(s) a plain tap should write to, in order. */
    cluster: string | string[]
    /**
     * The matter device type, where the tile's helper branches on it.
     * ⚠️ The vacuum needs this: `controlDevice` picks the RVC path only when
     * `deviceType` says so, and otherwise falls through to onOff and throws.
     */
    deviceType?: string
  }

  // The clusters each helper writes are asserted in matter-device.utils.spec.ts;
  // what these rows pin is which helper each TILE picked
  const TILES: TileCase[] = [
    {
      name: 'on off light',
      type: OnOffLightComponent,
      clusters: { onOff: { onOff: false } },
      cluster: 'onOff',
    },
    {
      name: 'on off light switch',
      type: OnOffLightSwitchComponent as unknown as TileCase['type'],
      clusters: { onOff: { onOff: false } },
      cluster: 'onOff',
    },
    {
      name: 'on off plug in unit',
      type: OnOffPlugInUnitComponent as unknown as TileCase['type'],
      clusters: { onOff: { onOff: false } },
      cluster: 'onOff',
    },
    {
      name: 'pump',
      type: MatterPumpComponent as unknown as TileCase['type'],
      clusters: { onOff: { onOff: false } },
      cluster: 'onOff',
    },
    {
      name: 'dimmable light',
      type: DimmableLightComponent as unknown as TileCase['type'],
      clusters: { onOff: { onOff: false }, levelControl: { currentLevel: 0 } },
      // Switching a dimmable light ON restores the level AND writes onOff - a
      // raw level write alone does not run Matter's on/off coupling, so the
      // state would never read as on
      cluster: ['levelControl', 'onOff'],
    },
    {
      name: 'colour temperature light',
      type: ColorTemperatureLightComponent as unknown as TileCase['type'],
      clusters: { onOff: { onOff: false }, levelControl: { currentLevel: 0 }, colorControl: { colorTemperatureMireds: 250 } },
      cluster: ['levelControl', 'onOff'],
    },
    {
      name: 'extended colour light',
      type: ExtendedColorLightComponent as unknown as TileCase['type'],
      clusters: { onOff: { onOff: false }, levelControl: { currentLevel: 0 }, colorControl: { currentHue: 50, currentSaturation: 200 } },
      cluster: ['levelControl', 'onOff'],
    },
    {
      name: 'door lock',
      type: MatterDoorLockComponent as unknown as TileCase['type'],
      clusters: { doorLock: { lockState: 1 } },
      cluster: 'doorLock',
    },
    {
      name: 'fan',
      type: MatterFanComponent as unknown as TileCase['type'],
      clusters: { fanControl: { fanMode: 0, percentSetting: 0 } },
      cluster: 'fanControl',
    },
    {
      name: 'water valve',
      type: MatterWaterValveComponent as unknown as TileCase['type'],
      clusters: { valveConfigurationAndControl: { currentState: 0, targetState: 0 } },
      cluster: 'valveConfigurationAndControl',
    },
    {
      name: 'window covering',
      type: MatterWindowCoveringComponent as unknown as TileCase['type'],
      clusters: { windowCovering: { currentPositionLiftPercent100ths: 0, targetPositionLiftPercent100ths: 0 } },
      cluster: 'windowCovering',
    },
    {
      name: 'robotic vacuum cleaner',
      type: RoboticVacuumCleanerComponent as unknown as TileCase['type'],
      deviceType: 'RoboticVacuumCleaner',
      clusters: {
        rvcRunMode: { currentMode: 0, supportedModes: [{ label: 'Idle', mode: 0 }, { label: 'Clean', mode: 1 }] },
        rvcOperationalState: { operationalState: 0 },
      },
      cluster: 'rvcRunMode',
    },
  ]

  describe.each(TILES.map(tile => [tile.name, tile] as const))('the %s tile', (_name, tile) => {
    it('writes nothing until the bridge is ready for control', async () => {
      const service = matterService({ clusters: tile.clusters, deviceType: tile.deviceType })
      const component = create(tile.type, service, false)

      component.onClick()
      await settle()

      expect(service.writes).toEqual([])
    })

    it('writes to its own cluster on a tap once the bridge is ready', async () => {
      const service = matterService({ clusters: tile.clusters, deviceType: tile.deviceType })
      const component = create(tile.type, service, true)

      component.onClick()
      await settle()

      expect(service.writes.map(write => write.cluster)).toEqual([tile.cluster].flat())
    })
  })

  // Six of the tiles also open a manage modal on a long press
  describe.each([
    ['dimmable light', DimmableLightComponent as unknown as new (...args: any[]) => { onLongClick: () => unknown }, { onOff: { onOff: true }, levelControl: { currentLevel: 120 } }],
    ['colour temperature light', ColorTemperatureLightComponent as unknown as new (...args: any[]) => { onLongClick: () => unknown }, { onOff: { onOff: true }, levelControl: { currentLevel: 120 }, colorControl: { colorTemperatureMireds: 250 } }],
    ['extended colour light', ExtendedColorLightComponent as unknown as new (...args: any[]) => { onLongClick: () => unknown }, { onOff: { onOff: true }, levelControl: { currentLevel: 120 }, colorControl: { currentHue: 50, currentSaturation: 200 } }],
    ['fan', MatterFanComponent as unknown as new (...args: any[]) => { onLongClick: () => unknown }, { fanControl: { fanMode: 2, percentSetting: 50 } }],
    ['door lock', MatterDoorLockComponent as unknown as new (...args: any[]) => { onLongClick: () => unknown }, { doorLock: { lockState: 1 } }],
    ['window covering', MatterWindowCoveringComponent as unknown as new (...args: any[]) => { onLongClick: () => unknown }, { windowCovering: { currentPositionLiftPercent100ths: 5000, targetPositionLiftPercent100ths: 5000 } }],
  ])('a long press on the %s tile', (_name, type, clusters) => {
    it('opens nothing until the bridge is ready for control', async () => {
      const component = create(type, matterService({ clusters }), false)

      await component.onLongClick()

      expect(modal.opened).toEqual([])
    })

    it('opens the manage modal once the bridge is ready', async () => {
      const component = create(type, matterService({ clusters }), true)

      await component.onLongClick()

      expect(modal.opened).toHaveLength(1)
      expect(modal.lastOpened()!.options?.backdrop).toBe('static')
    })
  })

  describe('the thermostat tile', () => {
    function thermostat() {
      return matterService({
        deviceType: 'Thermostat',
        clusters: {
          thermostat: {
            localTemperature: 2050,
            systemMode: 4,
            occupiedHeatingSetpoint: 2000,
            occupiedCoolingSetpoint: 2400,
          },
        },
      })
    }

    it('opens nothing until the bridge is ready for control', () => {
      // A thermostat has nothing to toggle, so a tap goes straight to the modal
      const component = create(MatterThermostatComponent, thermostat(), false)

      component.onClick()

      expect(modal.opened).toEqual([])
    })

    it('opens its manage modal on a tap once the bridge is ready', () => {
      const service = thermostat()
      const component = create(MatterThermostatComponent, service, true)

      component.onClick()

      expect(modal.opened).toHaveLength(1)
      expect(service.writes).toEqual([])
    })
  })

  describe('what each tile reads as on', () => {
    /**
     * Build a service and read the tile's own `isOn`.
     * @param type - the tile component
     * @param clusters - the device's cluster state
     */
    function isOn(type: new (...args: any[]) => { isOn: () => boolean }, clusters: Record<string, Record<string, unknown>>) {
      return create(type, matterService({ clusters })).isOn()
    }

    it('reads an on off light from its onOff cluster', () => {
      expect(isOn(OnOffLightComponent, { onOff: { onOff: true } })).toBe(true)
      expect(isOn(OnOffLightComponent, { onOff: { onOff: false } })).toBe(false)
    })

    it('reads a dimmable light as on whenever it has a level', () => {
      const type = DimmableLightComponent as unknown as new (...args: any[]) => { isOn: () => boolean }

      expect(isOn(type, { onOff: { onOff: true }, levelControl: { currentLevel: 120 } })).toBe(true)
      expect(isOn(type, { onOff: { onOff: false }, levelControl: { currentLevel: 0 } })).toBe(false)
    })

    it('reads a fan from its percent setting, not its mode', () => {
      const type = MatterFanComponent as unknown as new (...args: any[]) => { isOn: () => boolean }

      expect(isOn(type, { fanControl: { fanMode: 2, percentSetting: 50 } })).toBe(true)
      expect(isOn(type, { fanControl: { fanMode: 0, percentSetting: 0 } })).toBe(false)
    })
  })
})
