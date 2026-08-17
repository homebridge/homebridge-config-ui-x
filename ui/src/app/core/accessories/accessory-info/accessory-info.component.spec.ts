import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import type { FakeModalService } from '@/testing'

import { KeyValuePipe } from '@angular/common'
import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslatePipe } from '@ngx-translate/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AccessoryInfoComponent } from '@/app/core/accessories/accessory-info/accessory-info.component'
import { ACCESSORY_INFO_MODAL_DATA, REMOVE_INDIVIDUAL_ACCESSORIES_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { ConvertMiredPipe } from '@/app/core/pipes/convert-mired.pipe'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { PrettifyPipe } from '@/app/core/pipes/prettify.pipe'
import { ServiceToTranslationStringPipe } from '@/app/core/pipes/service-to-translation-string'
import { characteristic, hapService, matterService, modalServiceSpy } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The accessory info modal — what a long press on any tile opens.
 *
 * It is the only place a user can rename an accessory, change which tile type it
 * renders as, hide it, or put it on the dashboard, and two things about how it
 * does that matter more than they look:
 *
 * ⚠️ **it edits the live service object in place.** The tile on the page behind it
 * holds the same object, so it keeps a copy of the four editable fields and puts
 * them back on dismiss. Without that, cancelling still renames the accessory on
 * screen until the next poll overwrites it.
 *
 * ⚠️ **the type dropdown is not a free choice.** Offering a type the accessory
 * cannot render as gives a tile with no controls, so the list comes from groups of
 * interchangeable types — and Speaker/SmartSpeaker share one tile, so only the
 * variant matching the real accessory may be offered.
 */
describe('accessoryInfoComponent', () => {
  /**
   * ⚠️ Every pipe the template formats with has to stay: NO_ERRORS_SCHEMA
   * tolerates unknown elements and attributes but NOT unknown pipes, and the
   * matter cluster table needs `keyvalue` in particular.
   */
  const PIPES = [TranslatePipe, KeyValuePipe, ConvertTempPipe, ConvertMiredPipe, PrettifyPipe, ServiceToTranslationStringPipe]

  let modal: FakeModalService
  let activeModal: { close: ReturnType<typeof vi.fn>, dismiss: ReturnType<typeof vi.fn> }

  /** A pairing as the server reports it. */
  function pairing(overrides: Record<string, any> = {}) {
    return {
      _id: 'child-1',
      _username: '0E:12:34:56:78:9A',
      _main: true,
      name: 'Homebridge Test',
      ...overrides,
    }
  }

  /**
   * A cached accessory, as `cachedAccessories` on disk holds it.
   * @param options - what to put in its AccessoryInformation service
   * @param options.name - the cached Name characteristic
   * @param options.serial - the cached Serial Number characteristic
   * @param options.cacheFile - which cache file it came out of
   * @param options.uuid - the accessory UUID
   */
  function cached(options: { name?: string, serial?: string, cacheFile?: string, uuid?: string } = {}) {
    return {
      UUID: options.uuid ?? 'cached-uuid',
      $cacheFile: options.cacheFile ?? 'cachedAccessories',
      services: [{
        constructorName: 'AccessoryInformation',
        characteristics: [
          { displayName: 'Name', value: options.name ?? 'Test Accessory' },
          { displayName: 'Serial Number', value: options.serial ?? 'TEST-SERIAL' },
        ],
      }],
    }
  }

  /**
   * Open the modal on a service.
   * @param service - the accessory the tile was long-pressed on
   * @param options - the caches the modal is handed
   * @param options.accessoryCache - the cached accessories from disk
   * @param options.pairingCache - the known pairings
   */
  function open(service: ServiceTypeX, options: { accessoryCache?: any[], pairingCache?: any[] } = {}) {
    TestBed.resetTestingModule()
    modal = modalServiceSpy()
    activeModal = { close: vi.fn(), dismiss: vi.fn() }

    TestBed.configureTestingModule({
      imports: [AccessoryInfoComponent],
      providers: [
        provideTestTranslate(),
        provideFakes({ modal, activeModal }),
        {
          provide: ACCESSORY_INFO_MODAL_DATA,
          useValue: {
            service,
            accessoryCache: options.accessoryCache ?? [],
            pairingCache: options.pairingCache ?? [pairing()],
          },
        },
      ],
    })

    TestBed.overrideComponent(AccessoryInfoComponent, {
      set: { imports: PIPES, schemas: [NO_ERRORS_SCHEMA] },
    })

    const fixture = TestBed.createComponent(AccessoryInfoComponent)
    fixture.detectChanges()
    return fixture
  }

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(console.error).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('opening on a HAP accessory', () => {
    it('lists what the accessory reports about itself', () => {
      const info = open(hapService()).componentInstance

      expect(info.accessoryInformation).toEqual([
        { key: 'Manufacturer', value: 'Test Manufacturer' },
        { key: 'Model', value: 'Test Model' },
        { key: 'Name', value: 'Test Accessory' },
        { key: 'Serial Number', value: 'TEST-SERIAL' },
        { key: 'Firmware Revision', value: '1.0.0' },
      ])
    })

    it('knows it is not a matter accessory', () => {
      expect(open(hapService()).componentInstance.isMatterAccessory).toBe(false)
    })

    it('starts the type dropdown on the type the accessory really is', () => {
      const info = open(hapService({ type: 'Switch' })).componentInstance

      expect(info.localService.customType).toBe('Switch')
    })

    it('leaves a type the user already chose alone', () => {
      const service = hapService({ type: 'Switch', overrides: { customType: 'Outlet' } as any })

      expect(open(service).componentInstance.localService.customType).toBe('Outlet')
    })

    it('shows the lock management settings of a lock', () => {
      // They arrive as a separate linked service, and the modal is the only place
      // they are reachable
      const management = hapService({ type: 'LockManagement' })
      const other = hapService({ type: 'Battery' })
      const lock = hapService({
        type: 'LockMechanism',
        overrides: { linkedServices: { a: management, b: other } } as any,
      })

      expect(open(lock).componentInstance.extraServices).toEqual([management])
    })

    it('shows no extra services for a lock with nothing linked', () => {
      expect(open(hapService({ type: 'LockMechanism' })).componentInstance.extraServices).toEqual([])
    })
  })

  describe('the types it offers to render as', () => {
    /**
     * The dropdown contents for a HAP accessory of a given type.
     * @param type - the real accessory type
     * @param customType - a type already chosen, if any
     */
    function typesFor(type: string, customType?: string) {
      const service = hapService({ type, overrides: (customType ? { customType } : {}) as any })
      return open(service).componentInstance.customTypeList
    }

    it('offers the switch-like types for a switch', () => {
      const types = typesFor('Switch')

      expect(types).toContain('Outlet')
      expect(types).toContain('LockMechanism')
      expect(types).toContain('GarageDoorOpener')
    })

    it('offers the coverings for a window covering', () => {
      expect(typesFor('WindowCovering').sort()).toEqual(['Door', 'Window', 'WindowCovering'])
    })

    it('offers nothing for a type with no alternatives', () => {
      // A sensor cannot render as anything else
      expect(typesFor('MotionSensor')).toEqual([])
    })

    it('never lists the same type twice', () => {
      // 'Switch' appears in four of the groups
      const types = typesFor('Switch')

      expect(new Set(types).size).toBe(types.length)
    })

    it('offers a speaker the plain variant only', () => {
      // Speaker and SmartSpeaker render with the same tile; offering both is a
      // choice with no visible effect
      const types = typesFor('Speaker')

      expect(types).toContain('Speaker')
      expect(types).not.toContain('SmartSpeaker')
    })

    it('offers a smart speaker the smart variant only', () => {
      const types = typesFor('SmartSpeaker')

      expect(types).toContain('SmartSpeaker')
      expect(types).not.toContain('Speaker')
    })

    it('migrates a stale smart speaker choice on a plain speaker', () => {
      // Saved before the two were separated, and it would otherwise sit in the
      // dropdown as a value that is no longer offered
      const service = hapService({ type: 'Speaker', overrides: { customType: 'SmartSpeaker' } as any })

      expect(open(service).componentInstance.localService.customType).toBe('Speaker')
    })

    it('leaves a smart speaker its own choice', () => {
      const service = hapService({ type: 'SmartSpeaker', overrides: { customType: 'SmartSpeaker' } as any })

      expect(open(service).componentInstance.localService.customType).toBe('SmartSpeaker')
    })

    it('knows which entry is the accessory own type', () => {
      const info = open(hapService({ type: 'Switch' })).componentInstance

      expect(info.isDefaultType('Switch')).toBe(true)
      expect(info.isDefaultType('Outlet')).toBe(false)
    })
  })

  describe('opening on a matter accessory', () => {
    it('knows it is a matter accessory', () => {
      expect(open(matterService()).componentInstance.isMatterAccessory).toBe(true)
    })

    it('puts the device type at the top of the information list', () => {
      // Matter has no Model characteristic to lead with, and the device type is
      // what decides everything else about the tile
      const info = open(matterService({ deviceType: 'OnOffLight' })).componentInstance

      expect(info.accessoryInformation[0]).toEqual({ key: 'Device Type', value: 'OnOffLight' })
    })

    it('says the device type is unknown rather than leaving it blank', () => {
      const service = matterService()
      ;(service as any).deviceType = undefined

      expect(open(service).componentInstance.accessoryInformation[0]).toEqual({ key: 'Device Type', value: 'Unknown' })
    })

    it('lists every cluster the device reports', () => {
      const service = matterService({
        clusters: { onOff: { onOff: true }, levelControl: { currentLevel: 128 } },
      })

      expect(open(service).componentInstance.clusterInfo).toEqual([
        { name: 'onOff', attributes: { onOff: true } },
        { name: 'levelControl', attributes: { currentLevel: 128 } },
      ])
    })

    it('copes with a device reporting no clusters at all', () => {
      const service = matterService()
      ;(service as any).clusters = undefined

      expect(open(service).componentInstance.clusterInfo).toEqual([])
    })

    it('offers the matter types that share a tile', () => {
      const types = open(matterService({ deviceType: 'OnOffLight' })).componentInstance.customTypeList

      expect(types).toContain('OnOffPlugInUnit')
      expect(types).toContain('RoboticVacuumCleaner')
    })

    it('offers nothing for a matter device with no alternatives', () => {
      expect(open(matterService({ deviceType: 'ContactSensor' })).componentInstance.customTypeList).toEqual([])
    })

    it('starts the dropdown on the device type', () => {
      const info = open(matterService({ deviceType: 'Fan' })).componentInstance

      expect(info.localService.customType).toBe('Fan')
      expect(info.isDefaultType('Fan')).toBe(true)
    })

    it('never looks for a cached accessory', () => {
      // The cache files are a HAP thing; matter accessories are not in them
      const info = open(matterService(), { accessoryCache: [cached()] }).componentInstance

      expect(info.matchedCachedAccessory).toBeNull()
    })
  })

  describe('matching the accessory to the one cached on disk', () => {
    it('finds it by name and serial number', () => {
      // Which is what makes "remove this one accessory" able to point at the
      // right cache entry
      const info = open(hapService(), {
        accessoryCache: [cached({ uuid: 'the-one' })],
      }).componentInstance

      expect(info.matchedCachedAccessory?.UUID).toBe('the-one')
    })

    it('says which bridge it belongs to', () => {
      const info = open(hapService(), { accessoryCache: [cached()] }).componentInstance

      expect(info.matchedCachedAccessory?.bridge).toBe('Homebridge Test')
    })

    it('reads a child bridge cache file rather than the main one', () => {
      // A child bridge keeps its accessories in cachedAccessories.<id>
      const info = open(hapService(), {
        pairingCache: [pairing({ _main: false, _id: 'abc123', name: 'Child Bridge' })],
        accessoryCache: [cached({ cacheFile: 'cachedAccessories.abc123', uuid: 'from-child' })],
      }).componentInstance

      expect(info.matchedCachedAccessory?.UUID).toBe('from-child')
    })

    it('ignores an accessory cached for a different bridge', () => {
      const info = open(hapService(), {
        accessoryCache: [cached({ cacheFile: 'cachedAccessories.someone-else' })],
      }).componentInstance

      expect(info.matchedCachedAccessory).toBeNull()
    })

    it('gives up when the serial number does not match', () => {
      const info = open(hapService(), {
        accessoryCache: [cached({ serial: 'A-DIFFERENT-SERIAL' })],
      }).componentInstance

      expect(info.matchedCachedAccessory).toBeNull()
    })

    it('gives up rather than guessing between two identical entries', () => {
      // Two cached accessories with the same name and serial: picking either
      // could delete the wrong one
      const info = open(hapService(), {
        accessoryCache: [cached({ uuid: 'one' }), cached({ uuid: 'two' })],
      }).componentInstance

      expect(info.matchedCachedAccessory).toBeNull()
    })

    it('gives up when the bridge has no pairing on record', () => {
      const info = open(hapService(), {
        pairingCache: [pairing({ _username: 'AA:BB:CC:DD:EE:FF' })],
        accessoryCache: [cached()],
      }).componentInstance

      expect(info.matchedCachedAccessory).toBeNull()
    })

    it('gives up when nothing is cached for the bridge', () => {
      expect(open(hapService()).componentInstance.matchedCachedAccessory).toBeNull()
    })
  })

  describe('leaving without saving', () => {
    /** The four editable fields, as they stand on the live service object. */
    function editable(service: ServiceTypeX) {
      return {
        customName: (service as any).customName,
        customType: (service as any).customType,
        hidden: (service as any).hidden,
        onDashboard: (service as any).onDashboard,
      }
    }

    it('puts every edited field back', () => {
      // ⚠️ The tile behind the modal holds this same object. Without the restore,
      // a cancelled rename stays on screen until the next poll
      const service = hapService({ type: 'Switch', overrides: { customName: 'Kitchen', hidden: false, onDashboard: true } as any })
      const info = open(service).componentInstance

      Object.assign(info.localService, { customName: 'Changed', customType: 'Outlet', hidden: true, onDashboard: false })
      info.dismissModal()

      expect(editable(service)).toEqual({ customName: 'Kitchen', customType: 'Switch', hidden: false, onDashboard: true })
    })

    it('restores an unset name to unset, not to empty text', () => {
      // An empty string would be saved as a custom name of ''
      const service = hapService()
      const info = open(service).componentInstance

      info.localService.customName = 'Typed then cancelled'
      info.dismissModal()

      expect((service as any).customName).toBeUndefined()
    })

    it('dismisses the modal', () => {
      open(hapService()).componentInstance.dismissModal()

      expect(activeModal.dismiss).toHaveBeenCalled()
      expect(activeModal.close).not.toHaveBeenCalled()
    })
  })

  describe('saving', () => {
    it('hands back only the four fields the page has to persist', () => {
      const info = open(hapService({ type: 'Switch' })).componentInstance

      Object.assign(info.localService, { customName: 'Kitchen Light', customType: 'Outlet', hidden: false, onDashboard: true })
      info.saveModal()

      expect(activeModal.close).toHaveBeenCalledWith({
        customName: 'Kitchen Light',
        customType: 'Outlet',
        hidden: false,
        onDashboard: true,
      })
    })

    it('leaves the edits on the service rather than restoring them', () => {
      const service = hapService()
      const info = open(service).componentInstance

      info.localService.customName = 'Kitchen Light'
      info.saveModal()

      expect((service as any).customName).toBe('Kitchen Light')
    })
  })

  describe('whether there is anything to save', () => {
    it('says nothing changed on a freshly opened modal', () => {
      expect(open(hapService()).componentInstance.isFormUnchanged()).toBe(true)
    })

    it.each([
      ['customName', 'Kitchen'],
      ['customType', 'Outlet'],
      ['hidden', true],
      ['onDashboard', true],
    ])('notices a change to %s', (field, value) => {
      const info = open(hapService({ type: 'Switch' })).componentInstance

      ;(info.localService as any)[field] = value

      expect(info.isFormUnchanged()).toBe(false)
    })

    it('says nothing changed again once a change is undone', () => {
      const info = open(hapService({ type: 'Switch' })).componentInstance

      info.localService.customName = 'Kitchen'
      info.localService.customName = undefined

      expect(info.isFormUnchanged()).toBe(true)
    })
  })

  describe('hiding an accessory', () => {
    it('takes it off the dashboard at the same time', () => {
      // A hidden accessory left on the dashboard would be a tile the user cannot
      // find anywhere else to remove
      const info = open(hapService({ overrides: { onDashboard: true } as any })).componentInstance

      info.localService.hidden = true
      info.onHiddenChange()

      expect(info.localService.onDashboard).toBe(false)
    })

    it('leaves the dashboard choice alone when unhiding', () => {
      const info = open(hapService({ overrides: { onDashboard: true } as any })).componentInstance

      info.localService.hidden = false
      info.onHiddenChange()

      expect(info.localService.onDashboard).toBe(true)
    })
  })

  describe('the extra detail on a characteristic', () => {
    it('opens the detail of one with a range', () => {
      const info = open(hapService()).componentInstance
      const char = characteristic('Brightness', 50, { minValue: 0, maxValue: 100 } as any)

      info.toggleDetailsVisibility(char)

      expect(info.isDetailsVisible[char.uuid]).toBe(true)
    })

    it('closes it again', () => {
      const info = open(hapService()).componentInstance
      const char = characteristic('Brightness', 50, { minStep: 1 } as any)

      info.toggleDetailsVisibility(char)
      info.toggleDetailsVisibility(char)

      expect(info.isDetailsVisible[char.uuid]).toBe(false)
    })

    it('opens the detail of one with a list of valid values', () => {
      const info = open(hapService()).componentInstance
      const char = characteristic('TargetHeatingCoolingState', 0, { validValues: [0, 1, 2] } as any)

      info.toggleDetailsVisibility(char)

      expect(info.isDetailsVisible[char.uuid]).toBe(true)
    })

    it('does nothing for one with no detail to show', () => {
      // Otherwise the row grows a toggle that opens an empty panel
      const info = open(hapService()).componentInstance
      const char = characteristic('On', false)

      info.toggleDetailsVisibility(char)

      expect(info.isDetailsVisible[char.uuid]).toBeUndefined()
    })
  })

  describe('naming a characteristic value', () => {
    it('turns a numeric state into the name HAP gives it', () => {
      const info = open(hapService()).componentInstance

      expect(info.getEnumLabel('CurrentDoorState', 0)).toBeDefined()
    })

    it('says nothing for a characteristic with no named values', () => {
      const info = open(hapService()).componentInstance

      expect(info.getEnumLabel('NotACharacteristic', 3)).toBeUndefined()
    })
  })

  describe('copying an identifier', () => {
    let clipboard: { writeText: ReturnType<typeof vi.fn> }

    beforeEach(() => {
      clipboard = { writeText: vi.fn(async () => undefined) }
      Object.defineProperty(window.navigator, 'clipboard', { value: clipboard, configurable: true })
    })

    it('copies the unique id', () => {
      const info = open(hapService({ uniqueId: 'the-unique-id' })).componentInstance

      void info.copyUniqueIdToClipboard()

      expect(clipboard.writeText).toHaveBeenCalledWith('the-unique-id')
    })

    it('shows that it copied, then stops saying so', async () => {
      vi.useFakeTimers()
      const info = open(hapService({ uniqueId: 'the-unique-id' })).componentInstance

      await info.copyUniqueIdToClipboard()
      expect(info.uniqueIdCopied()).toBe(true)

      await vi.advanceTimersByTimeAsync(3000)
      expect(info.uniqueIdCopied()).toBe(false)
    })

    it('starts the three seconds again on a second copy', async () => {
      // Otherwise the tick disappears halfway through the second copy
      vi.useFakeTimers()
      const info = open(hapService({ uniqueId: 'the-unique-id' })).componentInstance

      await info.copyUniqueIdToClipboard()
      await vi.advanceTimersByTimeAsync(2000)
      await info.copyUniqueIdToClipboard()
      await vi.advanceTimersByTimeAsync(2000)

      expect(info.uniqueIdCopied()).toBe(true)
    })

    it('copies the cached accessory uuid', () => {
      const info = open(hapService(), { accessoryCache: [cached({ uuid: 'cached-uuid-here' })] }).componentInstance

      void info.copyUUIDToClipboard()

      expect(clipboard.writeText).toHaveBeenCalledWith('cached-uuid-here')
    })

    it('copies nothing when there is no cached accessory to copy from', () => {
      const info = open(hapService()).componentInstance

      void info.copyUUIDToClipboard()

      expect(clipboard.writeText).not.toHaveBeenCalled()
    })

    it('still copies when the clipboard api is refused', async () => {
      // iOS Safari rejects outside a user gesture, so there is a textarea
      // fallback - and the tick has to appear either way
      clipboard.writeText.mockRejectedValue(new Error('not allowed'))
      const execCommand = vi.fn(() => true)
      ;(document as any).execCommand = execCommand
      const info = open(hapService({ uniqueId: 'the-unique-id' })).componentInstance

      await info.copyUniqueIdToClipboard()

      expect(execCommand).toHaveBeenCalledWith('copy')
      expect(info.uniqueIdCopied()).toBe(true)
    })

    it('leaves no textarea behind when the fallback runs', async () => {
      // It appends one off-screen to select the text out of; leaving it attached
      // would litter the page with one per copy
      clipboard.writeText.mockRejectedValue(new Error('not allowed'))
      ;(document as any).execCommand = vi.fn(() => true)
      const info = open(hapService({ uniqueId: 'the-unique-id' })).componentInstance

      await info.copyUniqueIdToClipboard()

      expect(document.querySelectorAll('textarea')).toHaveLength(0)
    })

    it('forgets its timers when the modal closes', async () => {
      // ⚠️ Asserted through the signal rather than by counting timers: other
      // pending timers in the fixture would make a count assertion pass or fail
      // for reasons that have nothing to do with this component. If the timeout
      // survived, it would still be firing three seconds later - into a signal
      // belonging to a destroyed component
      vi.useFakeTimers()
      const fixture = open(hapService({ uniqueId: 'the-unique-id' }))
      const info = fixture.componentInstance

      await info.copyUniqueIdToClipboard()
      fixture.destroy()
      await vi.advanceTimersByTimeAsync(3000)

      expect(info.uniqueIdCopied()).toBe(true)
    })
  })

  describe('removing the accessory from the cache', () => {
    it('closes itself first, so the two modals do not stack', () => {
      const info = open(hapService()).componentInstance

      info.removeSingleCachedAccessories()

      expect(activeModal.close).toHaveBeenCalled()
      expect(modal.opened).toHaveLength(1)
    })

    it('points the remove modal at this accessory bridge', () => {
      // The username without its colons is the id the remove page uses
      const info = open(hapService()).componentInstance

      info.removeSingleCachedAccessories()

      expect(modal.dataFor(REMOVE_INDIVIDUAL_ACCESSORIES_MODAL_DATA)?.selectedBridge).toBe('0E123456789A')
    })

    it('highlights the cached entry it matched', () => {
      const info = open(hapService(), {
        accessoryCache: [cached({ uuid: 'the-one', cacheFile: 'cachedAccessories' })],
      }).componentInstance

      info.removeSingleCachedAccessories()

      const data = modal.dataFor(REMOVE_INDIVIDUAL_ACCESSORIES_MODAL_DATA)
      expect(data?.highlightUuid).toBe('the-one')
      expect(data?.highlightCacheFile).toBe('cachedAccessories')
    })

    it('highlights nothing when no cached entry was matched', () => {
      const info = open(hapService()).componentInstance

      info.removeSingleCachedAccessories()

      expect(modal.dataFor(REMOVE_INDIVIDUAL_ACCESSORIES_MODAL_DATA)?.highlightUuid).toBeUndefined()
    })

    it('opens it as a large modal that cannot be clicked away', () => {
      // Deleting a pairing is destructive
      const info = open(hapService()).componentInstance

      info.removeSingleCachedAccessories()

      expect(modal.lastOpened()!.options).toMatchObject({ size: 'lg', backdrop: 'static' })
    })
  })

  describe('opened without the data it needs', () => {
    it.each([
      ['no service', { service: undefined }],
      ['no accessory cache', { accessoryCache: undefined }],
      ['no pairing cache', { pairingCache: undefined }],
    ])('closes itself when handed %s', (_label, missing) => {
      // A half-built modal would throw on the first template expression, leaving
      // a blank grey box the user cannot get out of
      TestBed.resetTestingModule()
      activeModal = { close: vi.fn(), dismiss: vi.fn() }
      TestBed.configureTestingModule({
        imports: [AccessoryInfoComponent],
        providers: [
          provideTestTranslate(),
          provideFakes({ modal: modalServiceSpy(), activeModal }),
          {
            provide: ACCESSORY_INFO_MODAL_DATA,
            useValue: { service: hapService(), accessoryCache: [], pairingCache: [pairing()], ...missing },
          },
        ],
      })
      TestBed.overrideComponent(AccessoryInfoComponent, {
        set: { imports: PIPES, schemas: [NO_ERRORS_SCHEMA] },
      })

      const fixture = TestBed.createComponent(AccessoryInfoComponent)
      fixture.componentInstance.ngOnInit()

      expect(activeModal.dismiss).toHaveBeenCalled()
      expect(console.error).toHaveBeenCalled()
    })
  })
})
