import type { Plugin } from '@/app/core/plugins/manage-plugins.interfaces'
import type { Type } from '@angular/core'

import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { describe, expect, it, vi } from 'vitest'

import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { InformationComponent } from '@/app/core/components/information/information.component'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import {
  CONFIRM_MODAL_DATA,
  DISABLE_PLUGIN_MODAL_DATA,
  INFORMATION_MODAL_DATA,
  PLUGIN_COMPATIBILITY_MODAL_DATA,
  PLUGIN_MODAL_DATA,
} from '@/app/core/modal-data-tokens'
import { DisablePluginComponent } from '@/app/core/plugins/disable-plugin/disable-plugin.component'
import { DonateComponent } from '@/app/core/plugins/donate/donate.component'
import { PluginCompatibilityComponent } from '@/app/core/plugins/plugin-compatibility/plugin-compatibility.component'
import { PluginInfoComponent } from '@/app/core/plugins/plugin-info/plugin-info.component'
import { activeModalStub, makePlugin, makeSettings, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The plain dialogs. Individually they do almost nothing, but between them they
 * are opened from dozens of places, and every caller branches on whether the
 * dialog resolved or rejected: `close()` means the user agreed, a dismissal
 * means they backed out. Getting that the wrong way round turns a cancel into
 * a confirmation.
 */
describe('dialog modals', () => {
  let activeModal: ReturnType<typeof activeModalStub>

  function open<T>(component: Type<T>, data: Array<{ provide: any, useValue: any }> = []): T {
    TestBed.resetTestingModule()
    activeModal = activeModalStub()

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTranslate(),
        provideFakes({ settings: makeSettings(), toastr: toastrStub(), activeModal }),
        ...data,
      ],
    })

    const fixture = TestBed.createComponent(component)
    fixture.detectChanges()
    return fixture.componentInstance
  }

  const plugin: Plugin = makePlugin()

  /**
   * The dialogs that only ever back out, and the data each one needs.
   * Every one of these is a read-only panel: there is nothing to agree to.
   */
  const dismissOnly: Array<[string, Type<any>, Array<{ provide: any, useValue: any }>]> = [
    ['InformationComponent', InformationComponent, [{ provide: INFORMATION_MODAL_DATA, useValue: { title: 'Heads up', message: 'Something happened' } }]],
    ['PluginInfoComponent', PluginInfoComponent, [{ provide: PLUGIN_MODAL_DATA, useValue: { plugin } }]],
    ['DonateComponent', DonateComponent, [{ provide: PLUGIN_MODAL_DATA, useValue: { plugin: makePlugin({ funding: [{ type: 'github', url: 'https://github.com/sponsors/test' }] }) } }]],
  ]

  describe.each(dismissOnly)('%s', (_name, component, data) => {
    it('reports a dismissal when the user closes it', () => {
      const modal = open(component, data)

      modal.dismissModal()

      expect(activeModal.dismiss).toHaveBeenCalledWith('Dismiss')
      expect(activeModal.close).not.toHaveBeenCalled()
    })
  })

  describe('ConfirmComponent', () => {
    const data = [{ provide: CONFIRM_MODAL_DATA, useValue: { title: 'Are you sure?', message: 'This cannot be undone', confirmButtonLabel: 'Yes' } }]

    it('resolves when the user agrees', () => {
      const modal = open(ConfirmComponent, data)

      modal.closeModal()

      expect(activeModal.close).toHaveBeenCalled()
      expect(activeModal.dismiss).not.toHaveBeenCalled()
    })

    it('rejects when the user backs out', () => {
      const modal = open(ConfirmComponent, data)

      modal.dismissModal()

      expect(activeModal.dismiss).toHaveBeenCalledWith('Dismiss')
      expect(activeModal.close).not.toHaveBeenCalled()
    })

    it('shows the words the caller asked for', () => {
      const modal = open(ConfirmComponent, data)

      expect(modal.title).toBe('Are you sure?')
      expect(modal.message).toBe('This cannot be undone')
      expect(modal.confirmButtonLabel).toBe('Yes')
    })
  })

  describe('RestartHomebridgeComponent', () => {
    it('sends the user to the restart page and closes', () => {
      const modal = open(RestartHomebridgeComponent)
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true)

      modal.onRestartHomebridgeClick()

      expect(navigate).toHaveBeenCalledWith(['/restart'])
      expect(activeModal.close).toHaveBeenCalled()
    })

    it('leaves homebridge alone when the user declines', () => {
      const modal = open(RestartHomebridgeComponent)
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true)

      modal.dismissModal()

      // Declining must not restart anything - the caller decides what to do
      expect(navigate).not.toHaveBeenCalled()
      expect(activeModal.dismiss).toHaveBeenCalledWith('Dismiss')
    })
  })

  describe('PluginCompatibilityComponent', () => {
    const data = [{
      provide: PLUGIN_COMPATIBILITY_MODAL_DATA,
      useValue: { plugin: makePlugin({ updateEngines: { node: '>=22', homebridge: '>=2.0.0' } } as any), action: 'update' },
    }]

    it('resolves with a yes when the user carries on anyway', () => {
      const modal = open(PluginCompatibilityComponent, data)

      modal.closeModal()

      // The caller reads this value to decide whether to proceed, so an empty
      // close would read as "do not continue"
      expect(activeModal.close).toHaveBeenCalledWith(true)
    })

    it('rejects when the user thinks better of it', () => {
      const modal = open(PluginCompatibilityComponent, data)

      modal.dismissModal()

      expect(activeModal.dismiss).toHaveBeenCalledWith('Dismiss')
    })
  })

  describe('DisablePluginComponent', () => {
    const data = [{ provide: DISABLE_PLUGIN_MODAL_DATA, useValue: { plugin } }]

    it('resolves when the user agrees to disable', () => {
      const modal = open(DisablePluginComponent, data)

      modal.closeModal()

      expect(activeModal.close).toHaveBeenCalled()
    })

    it('rejects when the user backs out', () => {
      const modal = open(DisablePluginComponent, data)

      modal.dismissModal()

      expect(activeModal.dismiss).toHaveBeenCalledWith('Dismiss')
    })
  })

  describe('DonateComponent', () => {
    it.each([
      ['a list of links', ['https://paypal.me/test'], [{ type: 'other', url: 'https://paypal.me/test' }]],
      ['a list of typed entries', [{ type: 'github', url: 'https://github.com/sponsors/test' }], [{ type: 'github', url: 'https://github.com/sponsors/test' }]],
      ['a single link', 'https://paypal.me/test', [{ type: 'other', url: 'https://paypal.me/test' }]],
      ['a single typed entry', { type: 'kofi', url: 'https://ko-fi.com/test' }, [{ type: 'kofi', url: 'https://ko-fi.com/test' }]],
    ])('understands funding given as %s', (_case, funding, expected) => {
      // Plugin authors declare this four different ways in package.json
      const modal = open(DonateComponent, [{ provide: PLUGIN_MODAL_DATA, useValue: { plugin: makePlugin({ funding } as any) } }])

      expect(modal.fundingOptions()).toEqual(expected)
    })

    it('closes itself when there is nothing to show', () => {
      open(DonateComponent, [{ provide: PLUGIN_MODAL_DATA, useValue: { plugin: makePlugin({ funding: undefined } as any) } }])

      expect(activeModal.close).toHaveBeenCalled()
    })

    it('credits the original author of the ui itself', () => {
      const modal = open(DonateComponent, [{
        provide: PLUGIN_MODAL_DATA,
        useValue: { plugin: makePlugin({ name: 'homebridge-config-ui-x', author: 'homebridge', funding: 'https://paypal.me/oznu' } as any) },
      }])

      expect(modal.authorName()).toBe('oznu')
    })
  })
})
