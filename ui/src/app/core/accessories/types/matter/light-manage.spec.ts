import type { AccessoriesService } from '@/app/core/accessories/accessories.service'
import type { FakeToastr, MatterServiceFixture } from '@/testing'
import type { ComponentFixture } from '@angular/core/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { ColorTemperatureLightManageComponent } from '@/app/core/accessories/types/matter/color-temperature-light/color-temperature-light.manage.component'
import { DimmableLightManageComponent } from '@/app/core/accessories/types/matter/dimmable-light/dimmable-light.manage.component'
import { ExtendedColorLightManageComponent } from '@/app/core/accessories/types/matter/extended-color-light/extended-color-light.manage.component'
import { ConvertMiredPipe } from '@/app/core/pipes/convert-mired.pipe'
import { activeModalStub, matterService, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The three dimmable matter light modals.
 *
 * What these specs are really guarding is **which cluster each control writes
 * to**. Getting that wrong does not throw and does not show an error - the
 * write is simply dropped or lands on the wrong attribute, and the light
 * appears to ignore the slider. The two rules worth stating plainly:
 *
 * - Turning off goes to `onOff`, never to `levelControl`. A level of 0 is
 *   clamped up to `minLevel` (usually 1) by most devices, so the light would
 *   stay dimly on.
 * - Turning on goes to `levelControl`, so the light comes back at a level the
 *   user can see rather than at whatever it was left at.
 *
 * The debounce is 300ms in all three, so every slider assertion has to advance
 * the clock past it.
 */
describe('matter light manage modals', () => {
  type LightComponent = DimmableLightManageComponent | ColorTemperatureLightManageComponent | ExtendedColorLightManageComponent

  let toastr: FakeToastr
  let activeModal: NgbActiveModal
  let service: MatterServiceFixture
  let accessoryData: Subject<unknown>

  interface CreateOptions {
    clusters?: Record<string, Record<string, unknown>>
  }

  function accessoriesStub(current: MatterServiceFixture) {
    accessoryData = new Subject()
    return {
      accessoryData,
      accessories: { services: [current] },
    } as unknown as AccessoriesService
  }

  /**
   * Build one of the three modals.
   *
   * The nouislider component is stripped out with NO_ERRORS_SCHEMA - it needs a
   * real layout to initialise, and every rule under test is reachable from the
   * component's own methods.
   *
   * ⚠️ FormsModule has to go with it. The sliders carry `[(ngModel)]`, and with
   * the slider element unknown but NgModel still active, Angular fails with
   * NG01203 - no value accessor. Dropping both leaves `ngModel` as a plain
   * attribute binding the schema tolerates. The pipes stay, because an unknown
   * pipe is a hard template error even with the schema in place.
   */
  function create<T extends LightComponent>(type: new (...args: any[]) => T, options: CreateOptions = {}): ComponentFixture<T> {
    TestBed.resetTestingModule()

    service = matterService({
      deviceType: 'ExtendedColorLight',
      clusters: options.clusters ?? {
        onOff: { onOff: true },
        levelControl: { currentLevel: 120 },
        colorControl: { colorTemperatureMireds: 250, currentHue: 50, currentSaturation: 200 },
      },
    })
    toastr = toastrStub()
    activeModal = activeModalStub()

    TestBed.configureTestingModule({
      imports: [type],
      providers: [
        provideTestTranslate(),
        provideFakes({ toastr }),
        { provide: NgbActiveModal, useValue: activeModal },
        {
          provide: ACCESSORY_MANAGE_MODAL_DATA,
          useValue: { service, $accessories: accessoriesStub(service) },
        },
      ],
    })

    TestBed.overrideComponent(type, {
      set: {
        imports: [TranslatePipe, ConvertMiredPipe],
        schemas: [NO_ERRORS_SCHEMA],
      },
    })

    const fixture = TestBed.createComponent(type)
    fixture.detectChanges()
    return fixture
  }

  /** Push a slider change through its 300ms debounce and let the write settle. */
  async function slide(action: () => void) {
    action()
    await vi.advanceTimersByTimeAsync(300)
  }

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(console.error).mockClear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Every rule in this block is duplicated verbatim in all three components,
  // so it is asserted against all three - a fix applied to only one of them is
  // exactly the kind of drift worth catching
  describe.each([
    ['dimmable light', DimmableLightManageComponent as new (...args: any[]) => LightComponent],
    ['colour temperature light', ColorTemperatureLightManageComponent as new (...args: any[]) => LightComponent],
    ['extended colour light', ExtendedColorLightManageComponent as new (...args: any[]) => LightComponent],
  ])('%s brightness and power', (_name, type) => {
    it('reads the current level and on state from the clusters', () => {
      const component = create(type).componentInstance

      expect(component.targetMode).toBe(true)
      expect(component.targetBrightness.value).toBe(120)
      expect(component.targetBrightness.min).toBe(0)
      expect(component.targetBrightness.max).toBe(254)
    })

    it('shows the level as a percentage of 254, not of 100', () => {
      const component = create(type, {
        clusters: { onOff: { onOff: true }, levelControl: { currentLevel: 127 }, colorControl: {} },
      }).componentInstance

      expect(component.brightnessPercentage).toBe(50)
    })

    it('writes a brightness change to levelControl', async () => {
      const component = create(type).componentInstance

      await slide(() => {
        component.targetBrightness.value = 200
        component.onBrightnessStateChange()
      })

      expect(service.writes).toEqual([{ cluster: 'levelControl', attributes: { currentLevel: 200 } }])
    })

    it('waits out the debounce before writing anything', async () => {
      const component = create(type).componentInstance

      component.targetBrightness.value = 200
      component.onBrightnessStateChange()
      await vi.advanceTimersByTimeAsync(299)

      expect(service.writes).toEqual([])
    })

    it('sends only the last value when the slider is dragged', async () => {
      const component = create(type).componentInstance

      await slide(() => {
        for (const value of [130, 150, 180, 200]) {
          component.targetBrightness.value = value
          component.onBrightnessStateChange()
        }
      })

      expect(service.writes).toEqual([{ cluster: 'levelControl', attributes: { currentLevel: 200 } }])
    })

    it('writes onOff as well when the slider is moved while the light is off', async () => {
      // A raw level write does not run Matter's on/off coupling, so a slider
      // move from the off state must also set onOff
      const component = create(type, {
        clusters: { onOff: { onOff: false }, levelControl: { currentLevel: 0 }, colorControl: {} },
      }).componentInstance

      await slide(() => {
        component.targetBrightness.value = 200
        component.onBrightnessStateChange()
      })

      expect(service.writes).toEqual([
        { cluster: 'levelControl', attributes: { currentLevel: 200 } },
        { cluster: 'onOff', attributes: { onOff: true } },
      ])
    })

    it('turns the light off through onOff when the slider reaches zero', async () => {
      // A currentLevel of 0 is clamped up to minLevel by most devices, so the
      // light would stay dimly on
      const component = create(type).componentInstance

      await slide(() => {
        component.targetBrightness.value = 0
        component.onBrightnessStateChange()
      })

      expect(service.writes).toEqual([{ cluster: 'onOff', attributes: { onOff: false } }])
      expect(component.targetMode).toBe(false)
    })

    it('turns the light on through levelControl and onOff', async () => {
      // A raw level write does not run Matter's on/off coupling, so onOff
      // must be written too or the light state never reads as on
      const component = create(type).componentInstance

      await component.setTargetMode(true, { target: document.createElement('button') } as unknown as MouseEvent)

      expect(service.writes).toEqual([
        { cluster: 'levelControl', attributes: { currentLevel: 120 } },
        { cluster: 'onOff', attributes: { onOff: true } },
      ])
      expect(component.targetMode).toBe(true)
    })

    it('turns a light that was left at zero back on at full brightness', async () => {
      const component = create(type, {
        clusters: { onOff: { onOff: false }, levelControl: { currentLevel: 0 }, colorControl: {} },
      }).componentInstance

      await component.setTargetMode(true, { target: document.createElement('button') } as unknown as MouseEvent)

      expect(service.writes).toEqual([
        { cluster: 'levelControl', attributes: { currentLevel: 254 } },
        { cluster: 'onOff', attributes: { onOff: true } },
      ])
    })

    it('turns the light off through onOff', async () => {
      const component = create(type).componentInstance

      await component.setTargetMode(false, { target: document.createElement('button') } as unknown as MouseEvent)

      expect(service.writes).toEqual([{ cluster: 'onOff', attributes: { onOff: false } }])
      expect(component.targetMode).toBe(false)
    })

    it('puts the switch back and warns when the write is refused', async () => {
      const component = create(type).componentInstance
      service.failWrites('onOff', new Error('device offline'))

      await component.setTargetMode(false, { target: document.createElement('button') } as unknown as MouseEvent)

      expect(component.targetMode).toBe(true)
      expect(toastr.error).toHaveBeenCalledWith('toast.api_error_generic', 'toast.title_error')
    })

    it('puts the slider back when a brightness write is refused', async () => {
      const component = create(type).componentInstance
      service.failWrites('levelControl', new Error('device offline'))

      await slide(() => {
        component.targetBrightness.value = 200
        component.onBrightnessStateChange()
      })

      expect(component.targetBrightness.value).toBe(120)
      expect(toastr.error).toHaveBeenCalled()
    })

    it('complains rather than writing nowhere when the level cluster is missing', async () => {
      const component = create(type, { clusters: { onOff: { onOff: true }, colorControl: {} } }).componentInstance

      await slide(() => {
        component.targetBrightness.value = 200
        component.onBrightnessStateChange()
      })

      expect(service.writes).toEqual([])
      expect(toastr.error).toHaveBeenCalled()
    })

    it('follows the accessory when it is changed elsewhere', async () => {
      const component = create(type).componentInstance

      const updated = matterService({
        deviceType: 'ExtendedColorLight',
        clusters: {
          onOff: { onOff: false },
          levelControl: { currentLevel: 0 },
          colorControl: { colorTemperatureMireds: 250, currentHue: 50, currentSaturation: 200 },
        },
      })
      component.$accessories.accessories.services[0] = updated
      accessoryData.next([updated])

      expect(component.targetMode).toBe(false)
      expect(component.targetBrightness.value).toBe(0)
    })
  })

  // Colour temperature lives on the colorControl cluster in mireds, but the
  // slider is in kelvin, so the two are inverted with respect to each other
  describe.each([
    ['colour temperature light', ColorTemperatureLightManageComponent as new (...args: any[]) => ColorTemperatureLightManageComponent | ExtendedColorLightManageComponent],
    ['extended colour light', ExtendedColorLightManageComponent as new (...args: any[]) => ColorTemperatureLightManageComponent | ExtendedColorLightManageComponent],
  ])('%s colour temperature', (_name, type) => {
    it('runs the slider from warm to cool, with the mired range inverted', () => {
      const component = create(type).componentInstance

      // 500 mireds is the warm end, 147 the cool end
      expect(component.targetColorTemperature.min).toBe(2000)
      expect(component.targetColorTemperature.max).toBe(6803)
      expect(component.targetColorTemperature.mired).toBe(250)
      expect(component.targetColorTemperature.value).toBe(4000)
    })

    it('writes mireds to colorControl, not the kelvin the slider shows', async () => {
      const component = create(type).componentInstance

      await slide(() => {
        component.targetColorTemperature.value = 2500
        component.onColorTemperatureStateChange()
      })

      expect(service.writes).toEqual([{ cluster: 'colorControl', attributes: { colorTemperatureMireds: 400 } }])
    })

    it('records the mired value straight away so the label does not lag the slider', () => {
      const component = create(type).componentInstance

      component.targetColorTemperature.value = 2500
      component.onColorTemperatureStateChange()

      expect(component.targetColorTemperature.mired).toBe(400)
    })

    it('puts the slider back in kelvin when the write is refused', async () => {
      const component = create(type).componentInstance
      service.failWrites('colorControl', new Error('device offline'))

      await slide(() => {
        component.targetColorTemperature.value = 2500
        component.onColorTemperatureStateChange()
      })

      expect(component.targetColorTemperature.mired).toBe(250)
      expect(component.targetColorTemperature.value).toBe(4000)
    })

    it('follows a colour temperature change made elsewhere', () => {
      const component = create(type).componentInstance

      const updated = matterService({
        deviceType: 'ExtendedColorLight',
        clusters: {
          onOff: { onOff: true },
          levelControl: { currentLevel: 120 },
          colorControl: { colorTemperatureMireds: 500, currentHue: 50, currentSaturation: 200 },
        },
      })
      component.$accessories.accessories.services[0] = updated
      accessoryData.next([updated])

      expect(component.targetColorTemperature.mired).toBe(500)
      expect(component.targetColorTemperature.value).toBe(2000)
    })
  })

  describe('extended colour light hue and saturation', () => {
    it('runs both sliders over the matter range, not zero to one hundred', () => {
      const component = create(ExtendedColorLightManageComponent).componentInstance

      expect(component.targetHue).toEqual({ value: 50, min: 0, max: 254, step: 1 })
      expect(component.targetSaturation).toEqual({ value: 200, min: 0, max: 254, step: 1 })
    })

    it('reports both as a percentage of 254', () => {
      const component = create(ExtendedColorLightManageComponent, {
        clusters: { onOff: { onOff: true }, levelControl: { currentLevel: 120 }, colorControl: { currentHue: 127, currentSaturation: 254 } },
      }).componentInstance

      expect(component.huePercentage).toBe(50)
      expect(component.saturationPercentage).toBe(100)
    })

    it('sends hue and saturation together, because the cluster needs both', async () => {
      const component = create(ExtendedColorLightManageComponent).componentInstance

      await slide(() => {
        component.targetHue.value = 100
        component.onHueStateChange()
      })

      expect(service.writes).toEqual([{
        cluster: 'colorControl',
        attributes: { currentHue: 100, currentSaturation: 200 },
      }])
    })

    it('sends both from the saturation slider too', async () => {
      const component = create(ExtendedColorLightManageComponent).componentInstance

      await slide(() => {
        component.targetSaturation.value = 254
        component.onSaturationStateChange()
      })

      expect(service.writes).toEqual([{
        cluster: 'colorControl',
        attributes: { currentHue: 50, currentSaturation: 254 },
      }])
    })

    it('puts both sliders back when the write is refused', async () => {
      const component = create(ExtendedColorLightManageComponent).componentInstance
      service.failWrites('colorControl', new Error('device offline'))

      await slide(() => {
        component.targetHue.value = 100
        component.targetSaturation.value = 254
        component.onHueStateChange()
      })

      expect(component.targetHue.value).toBe(50)
      expect(component.targetSaturation.value).toBe(200)
    })

    it('puts both sliders back when the saturation write is refused', async () => {
      // ⚠️ The saturation slider has its own copy of the revert. Both sliders send
      // the same pair, so a revert that only put one back would leave the screen
      // claiming a colour the light never received
      const component = create(ExtendedColorLightManageComponent).componentInstance
      service.failWrites('colorControl', new Error('device offline'))

      await slide(() => {
        component.targetHue.value = 100
        component.targetSaturation.value = 254
        component.onSaturationStateChange()
      })

      expect(component.targetHue.value).toBe(50)
      expect(component.targetSaturation.value).toBe(200)
      expect(toastr.error).toHaveBeenCalled()
    })

    it('complains rather than writing nowhere when the colour cluster is missing', async () => {
      const component = create(ExtendedColorLightManageComponent, {
        clusters: { onOff: { onOff: true }, levelControl: { currentLevel: 120 } },
      }).componentInstance

      await slide(() => {
        component.targetSaturation.value = 254
        component.onSaturationStateChange()
      })

      expect(toastr.error).toHaveBeenCalled()
    })

    /**
     * Replace the accessory with one reporting a different colour.
     * @param component - the modal
     * @param colorControl - the new colorControl attributes
     */
    function changedElsewhere(component: ExtendedColorLightManageComponent, colorControl: Record<string, unknown>) {
      const updated = matterService({
        deviceType: 'ExtendedColorLight',
        clusters: {
          onOff: { onOff: true },
          levelControl: { currentLevel: 120 },
          colorControl,
        },
      })
      component.$accessories.accessories.services[0] = updated
      accessoryData.next([updated])
    }

    it('follows a colour change made elsewhere', () => {
      const component = create(ExtendedColorLightManageComponent).componentInstance

      changedElsewhere(component, { colorTemperatureMireds: 250, currentHue: 200, currentSaturation: 100 })

      expect(component.targetHue.value).toBe(200)
      expect(component.targetSaturation.value).toBe(100)
    })

    it('takes a saturation change without touching the hue', () => {
      // The hue slider's gradient is rebuilt only when the hue itself moves, so
      // the sliders do not redraw on every unrelated poll
      const component = create(ExtendedColorLightManageComponent).componentInstance

      changedElsewhere(component, { colorTemperatureMireds: 250, currentHue: 50, currentSaturation: 10 })

      expect(component.targetHue.value).toBe(50)
      expect(component.targetSaturation.value).toBe(10)
    })
  })

  describe('extended colour light feature gating', () => {
    it('offers colour temperature when the feature map says the device has it', () => {
      const component = create(ExtendedColorLightManageComponent, {
        clusters: {
          onOff: { onOff: true },
          levelControl: { currentLevel: 120 },
          colorControl: { featureMap: { colorTemperature: true, hueSaturation: true } },
        },
      }).componentInstance

      expect(component.supportsColorTemperature).toBe(true)
      expect(component.supportsHueSaturation).toBe(true)
    })

    it('hides colour temperature when the feature map says it is absent', () => {
      // The declared attribute is present, so only the feature map can rule
      // it out - writing to a cluster without the feature is rejected
      const component = create(ExtendedColorLightManageComponent, {
        clusters: {
          onOff: { onOff: true },
          levelControl: { currentLevel: 120 },
          colorControl: { colorTemperatureMireds: 250, currentHue: 50, featureMap: { colorTemperature: false, hueSaturation: true } },
        },
      }).componentInstance

      expect(component.supportsColorTemperature).toBe(false)
      expect(component.supportsHueSaturation).toBe(true)
    })

    it('falls back to the declared attributes when no feature map is sent', () => {
      // Older Homebridge versions send no feature map at all
      const component = create(ExtendedColorLightManageComponent, {
        clusters: {
          onOff: { onOff: true },
          levelControl: { currentLevel: 120 },
          colorControl: { currentHue: 50, currentSaturation: 200 },
        },
      }).componentInstance

      expect(component.supportsColorTemperature).toBe(false)
      expect(component.supportsHueSaturation).toBe(true)
    })

    it('skips loading the colour temperature slider when the device has none', () => {
      const component = create(ExtendedColorLightManageComponent, {
        clusters: {
          onOff: { onOff: true },
          levelControl: { currentLevel: 120 },
          colorControl: { currentHue: 50, currentSaturation: 200 },
        },
      }).componentInstance

      expect(component.targetColorTemperature).toBeUndefined()
    })

    it('survives a live update on a device with no colour temperature', () => {
      // handleAccessoryUpdate would throw reading an undefined slider object
      const component = create(ExtendedColorLightManageComponent, {
        clusters: {
          onOff: { onOff: true },
          levelControl: { currentLevel: 120 },
          colorControl: { currentHue: 50, currentSaturation: 200 },
        },
      }).componentInstance

      expect(() => accessoryData.next([service])).not.toThrow()
      expect(component.targetBrightness.value).toBe(120)
      expect(component.targetColorTemperature).toBeUndefined()
    })
  })
})
