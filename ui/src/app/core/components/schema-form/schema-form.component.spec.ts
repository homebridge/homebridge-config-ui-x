import type { FakeSettings } from '@/testing'
import type { ComponentFixture } from '@angular/core/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SchemaFormComponent } from '@/app/core/components/schema-form/schema-form.component'
import { makeSettings } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The wrapper around ng-formworks that renders every plugin's generated
 * settings form.
 *
 * It exists almost entirely to work around how ng-formworks handles data: the
 * form hands back a rebuilt object on every keystroke, so this component keeps
 * the caller's own object identity and merges into it. Two consequences are
 * load-bearing rather than cosmetic:
 *
 * - **`_bridge` is preserved verbatim.** It is injected as a hidden sub-schema
 *   the form does not model, so letting the form's copy through silently strips
 *   a child bridge's HAP/Matter disable and externals-only state on save.
 * - **the emitted object is the SAME reference** that was passed in, so the
 *   component's own `effect` does not see a change and reset the form
 *   mid-typing.
 *
 * ng-formworks itself is dropped from the template - it needs a real schema
 * renderer, and every rule here is reachable from the two handlers it calls.
 */
describe('schemaFormComponent', () => {
  let fixture: ComponentFixture<SchemaFormComponent>
  let component: SchemaFormComponent
  let settings: FakeSettings
  let emitted: any[]
  let validity: boolean[]

  function create(options: { lang?: string, data?: any, schema?: any } = {}) {
    TestBed.resetTestingModule()
    settings = makeSettings({ env: { lang: options.lang ?? 'en' } })

    TestBed.configureTestingModule({
      imports: [SchemaFormComponent],
      providers: [
        provideTestTranslate(),
        provideFakes({ settings }),
      ],
    })

    TestBed.overrideComponent(SchemaFormComponent, {
      set: { imports: [], schemas: [NO_ERRORS_SCHEMA] },
    })

    fixture = TestBed.createComponent(SchemaFormComponent)
    component = fixture.componentInstance
    fixture.componentRef.setInput('configSchema', options.schema ?? { schema: { type: 'object', properties: {} } })
    fixture.componentRef.setInput('data', options.data ?? { name: 'Example' })

    emitted = []
    validity = []
    component.dataChange.subscribe(value => emitted.push(value))
    component.isValid.subscribe(value => validity.push(value))

    fixture.detectChanges()
    return component
  }

  beforeEach(() => {
    create()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('the form language', () => {
    it('uses english by default', () => {
      expect(component.language()).toBe('en')
    })

    it('uses the language the user chose', () => {
      create({ lang: 'de' })

      expect(component.language()).toBe('de')
    })

    it('drops the region, because the form only ships base languages', () => {
      create({ lang: 'pt-BR' })

      expect(component.language()).toBe('pt')
    })

    it('stays on english for a language the form does not ship', () => {
      // The app has far more translations than ng-formworks does
      create({ lang: 'uk' })

      expect(component.language()).toBe('en')
    })

    it('maps a chinese variant onto the base language it does ship', () => {
      create({ lang: 'zh-TW' })

      expect(component.language()).toBe('zh')
    })
  })

  describe('the form options', () => {
    it('turns off everything that would fight the surrounding modal', () => {
      // Each of these changes every plugin's form at once: the modal supplies
      // its own save button, the app must not fetch assets from the internet,
      // and empty fields must not be written back into config.json
      expect(component.jsonFormOptions).toEqual({
        addSubmit: false,
        loadExternalAssets: false,
        returnEmptyFields: false,
        setSchemaDefaults: true,
        autocomplete: false,
      })
    })
  })

  describe('following the data input', () => {
    it('renders the object it was given', () => {
      const data = { name: 'Front Room' }
      create({ data })

      expect(component.currentData()).toBe(data)
    })

    it('re-renders when the caller swaps in a different object', () => {
      const replacement = { name: 'Hallway' }

      fixture.componentRef.setInput('data', replacement)
      fixture.detectChanges()

      expect(component.currentData()).toBe(replacement)
    })

    it('ignores an edit to the same object', () => {
      // Mutating in place is how the custom plugin UI updates config, and
      // re-rendering on every one of those would reset the form as it is typed
      const data = component.currentData()
      data.name = 'Edited elsewhere'

      fixture.detectChanges()

      expect(component.currentData()).toBe(data)
    })
  })

  describe('a change made in the form', () => {
    it('emits the object the caller passed in, not the rebuilt one', () => {
      const original = component.currentData()

      component.onChanges({ name: 'Typed' })

      expect(emitted).toHaveLength(1)
      expect(emitted[0]).toBe(original)
      expect(original.name).toBe('Typed')
    })

    it('emits on both outputs, because callers listen to different ones', () => {
      const changed: any[] = []
      component.dataChanged.subscribe(value => changed.push(value))

      component.onChanges({ name: 'Typed' })

      expect(changed).toHaveLength(1)
      expect(changed[0]).toBe(component.currentData())
    })

    it('removes a key the user cleared out of the form', () => {
      create({ data: { name: 'Example', legacyOption: true } })

      component.onChanges({ name: 'Example' })

      expect(component.currentData()).toEqual({ name: 'Example' })
    })

    it('preserves the child bridge block the form does not model', () => {
      // ng-formworks rebuilds `_bridge` from its hidden sub-schema and drops the
      // nested shapes, so its copy would strip a disabled HAP protocol
      const bridge = { username: '0E:11:11:11:11:11', hap: { enabled: false, externalsOnly: true } }
      create({ data: { name: 'Example', _bridge: bridge } })

      component.onChanges({ name: 'Example', _bridge: { username: '0E:11:11:11:11:11' } })

      expect(component.currentData()._bridge).toBe(bridge)
      expect(component.currentData()._bridge.hap).toEqual({ enabled: false, externalsOnly: true })
    })

    it('does not invent a child bridge block the caller never had', () => {
      create({ data: { name: 'Example' } })

      component.onChanges({ name: 'Example', _bridge: { username: '0E:11:11:11:11:11' } })

      expect('_bridge' in component.currentData()).toBe(false)
    })

    it('does not reset the form while its own change is settling', async () => {
      // The emitted object is the same reference, but a caller that swaps in a
      // fresh one mid-keystroke must not blow away what is being typed
      const original = component.currentData()
      component.onChanges({ name: 'Typed' })

      fixture.componentRef.setInput('data', { name: 'From the server' })
      fixture.detectChanges()

      expect(component.currentData()).toBe(original)
      expect(component.currentData().name).toBe('Typed')
    })

    it('accepts the next external change once its own has settled', async () => {
      // The suppression lasts exactly one microtask, so the caller is not
      // locked out of the form afterwards.
      //
      // ⚠️ This does NOT cover the `lastDataReference` write inside the
      // suppressed branch. Removing that line leaves every test here passing,
      // and working through the sequences by hand says why: `currentData` is
      // never updated on that branch, so whichever reference is recorded, the
      // next genuine input change produces the same result. It is defensive
      // rather than observable - worth knowing before someone writes a test
      // that appears to cover it.
      component.onChanges({ name: 'Typed' })
      fixture.componentRef.setInput('data', { name: 'From the server' })
      fixture.detectChanges()

      await Promise.resolve()
      fixture.componentRef.setInput('data', { name: 'And again' })
      fixture.detectChanges()

      expect(component.currentData()).toEqual({ name: 'And again' })
    })

    it('emits the raw form object when there is nothing to merge into', () => {
      create({ data: null })

      component.onChanges({ name: 'Typed' })

      expect(emitted[0]).toEqual({ name: 'Typed' })
    })
  })

  describe('reporting validity', () => {
    it('waits for the form to settle before reporting', () => {
      vi.useFakeTimers()
      create()

      component.validChange(false)
      expect(validity).toEqual([])

      vi.advanceTimersByTime(50)
      expect(validity).toEqual([false])
    })

    it('reports only the state the form settled on', () => {
      // ng-formworks toggles validity rapidly while it builds the form, and
      // each flicker would enable and disable the save button in the modal
      vi.useFakeTimers()
      create()

      component.validChange(false)
      component.validChange(true)
      component.validChange(false)
      component.validChange(true)
      vi.advanceTimersByTime(50)

      expect(validity).toEqual([true])
    })

    it('does not repeat a state it has already reported', () => {
      vi.useFakeTimers()
      create()

      component.validChange(true)
      vi.advanceTimersByTime(50)
      component.validChange(true)
      vi.advanceTimersByTime(50)

      expect(validity).toEqual([true])
    })

    it('reports a genuine change back the other way', () => {
      vi.useFakeTimers()
      create()

      component.validChange(true)
      vi.advanceTimersByTime(50)
      component.validChange(false)
      vi.advanceTimersByTime(50)

      expect(validity).toEqual([true, false])
    })

    it('leaves no validation work scheduled after the form has gone', () => {
      // ⚠️ Assert on the pending timer, not on the absence of an emit: Angular
      // detaches an `output()` subscription on destroy anyway, so "nothing was
      // emitted" stays true whether or not the timeout is cleared
      vi.useFakeTimers()
      create()

      component.validChange(true)
      expect(vi.getTimerCount()).toBe(1)

      fixture.destroy()

      expect(vi.getTimerCount()).toBe(0)
    })

    it('tells nobody about validity once the form has gone', () => {
      vi.useFakeTimers()
      create()

      component.validChange(true)
      fixture.destroy()
      vi.advanceTimersByTime(500)

      expect(validity).toEqual([])
    })
  })
})
