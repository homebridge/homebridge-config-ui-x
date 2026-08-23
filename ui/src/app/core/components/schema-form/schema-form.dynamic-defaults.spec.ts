import type { FakeSettings } from '@/testing'
import type { ComponentFixture } from '@angular/core/testing'

import { importProvidersFrom } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Bootstrap5FrameworkModule } from '@ng-formworks/bootstrap5'
import { beforeEach, describe, expect, it } from 'vitest'

import { SchemaFormComponent } from '@/app/core/components/schema-form/schema-form.component'
import { makeSettings } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The `dynamicDefaults` keyword from ajv-keywords (issue #2606): a plugin's
 * config schema can declare `dynamicDefaults: { id: 'uuid' }` and a config
 * that has no `id` gets one generated for it.
 *
 * Unlike the sibling spec, this one renders the REAL ng-formworks form with
 * the real Bootstrap 5 framework, because the feature lives entirely inside
 * the patched library (`ui/patches/@ng-formworks+core+*.patch`) and only
 * shows up in what the rendered form emits.
 *
 * The regression being pinned down: ajv only compiles `dynamicDefaults` into
 * working code when the ajv instance has `useDefaults` on, and the library's
 * validation instance does not - so the keyword silently became a no-op.
 * The fix applies the schema once to the initial form values with a dedicated
 * `useDefaults` instance, which is also why these tests insist the value is
 * STABLE: enabling `useDefaults` on the validation instance instead would
 * regenerate a fresh uuid on every keystroke (the empty control is stripped
 * by `returnEmptyFields: false` before each validation) and resurrect static
 * defaults the user has cleared.
 */
describe('schemaFormComponent dynamicDefaults', () => {
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  let fixture: ComponentFixture<SchemaFormComponent>
  let component: SchemaFormComponent
  let settings: FakeSettings
  let emitted: any[]

  const schema = {
    type: 'object',
    dynamicDefaults: {
      id: 'uuid',
    },
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
      },
      name: {
        type: 'string',
      },
      port: {
        type: 'integer',
        default: 8080,
      },
    },
  }

  const arraySchema = {
    type: 'object',
    properties: {
      name: {
        type: 'string',
      },
      devices: {
        type: 'array',
        items: {
          type: 'object',
          dynamicDefaults: {
            id: 'uuid',
          },
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            label: {
              type: 'string',
            },
          },
        },
      },
    },
  }

  function create(data: any, useSchema: any = schema) {
    TestBed.resetTestingModule()
    settings = makeSettings({ env: { lang: 'en' } })

    TestBed.configureTestingModule({
      imports: [SchemaFormComponent],
      providers: [
        provideTestTranslate(),
        provideFakes({ settings }),
        importProvidersFrom(Bootstrap5FrameworkModule),
      ],
    })

    fixture = TestBed.createComponent(SchemaFormComponent)
    component = fixture.componentInstance
    fixture.componentRef.setInput('configSchema', { schema: useSchema })
    fixture.componentRef.setInput('data', data)

    emitted = []
    component.dataChange.subscribe(value => emitted.push(value))

    fixture.detectChanges()
  }

  function findInput(property: string): HTMLInputElement {
    const input = fixture.nativeElement.querySelector(`input[name="${property}"]`)
    if (!input) {
      throw new Error(`No input rendered for "${property}"`)
    }
    return input
  }

  function type(input: HTMLInputElement, value: string) {
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    fixture.detectChanges()
  }

  /** The library debounces valueChanges by 50ms before validating and emitting */
  async function settle() {
    await new Promise(resolve => setTimeout(resolve, 120))
    fixture.detectChanges()
  }

  beforeEach(() => {
    create({ name: 'My Plugin' })
  })

  it('generates a uuid for the missing property and shows it in the form', () => {
    expect(findInput('id').value).toMatch(UUID_PATTERN)
  })

  it('emits the generated uuid with the form data, exactly once and unchanged', async () => {
    const generated = findInput('id').value

    type(findInput('name'), 'Renamed')
    await settle()

    expect(emitted.length).toBeGreaterThan(0)
    const data = emitted[emitted.length - 1]
    expect(data.name).toBe('Renamed')
    expect(data.id).toBe(generated)

    // Exactly once: the uuid must not be duplicated anywhere else in the data
    const occurrences = JSON.stringify(data).split(generated).length - 1
    expect(occurrences).toBe(1)
  })

  it('keeps the same uuid across re-validations instead of regenerating it', async () => {
    const generated = findInput('id').value

    type(findInput('name'), 'First edit')
    await settle()
    const afterFirst = emitted[emitted.length - 1].id

    type(findInput('name'), 'Second edit')
    await settle()
    const afterSecond = emitted[emitted.length - 1].id

    expect(afterFirst).toBe(generated)
    expect(afterSecond).toBe(generated)
    expect(findInput('id').value).toBe(generated)
  })

  it('leaves an existing value alone', async () => {
    const existing = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
    create({ id: existing, name: 'My Plugin' })

    expect(findInput('id').value).toBe(existing)

    type(findInput('name'), 'Renamed')
    await settle()

    expect(emitted[emitted.length - 1].id).toBe(existing)
  })

  describe('inside array items', () => {
    function idInputs(): HTMLInputElement[] {
      return Array.from(fixture.nativeElement.querySelectorAll('input[name="id"]'))
    }

    function addItem() {
      const button = fixture.nativeElement.querySelector('add-reference-widget button')
      if (!button) {
        throw new Error('No add-item button rendered')
      }
      button.click()
      fixture.detectChanges()
    }

    beforeEach(() => {
      create({ name: 'My Plugin', devices: [{ label: 'first' }] }, arraySchema)
    })

    it('generates a uuid for an existing item that is missing one', () => {
      expect(idInputs()).toHaveLength(1)
      expect(idInputs()[0].value).toMatch(UUID_PATTERN)
    })

    it('generates a distinct uuid for an item added through the form', async () => {
      const firstId = idInputs()[0].value

      addItem()
      await settle()

      const inputs = idInputs()
      expect(inputs).toHaveLength(2)
      expect(inputs[1].value).toMatch(UUID_PATTERN)
      expect(inputs[1].value).not.toBe(firstId)

      const data = emitted[emitted.length - 1]
      expect(data.devices).toHaveLength(2)
      expect(data.devices[0].id).toBe(firstId)
      expect(data.devices[1].id).toBe(inputs[1].value)
    })

    it('keeps an added item uuid stable across later edits', async () => {
      addItem()
      await settle()
      const addedId = idInputs()[1].value

      type(findInput('name'), 'Renamed')
      await settle()

      expect(idInputs()[1].value).toBe(addedId)
      const data = emitted[emitted.length - 1]
      expect(data.devices[1].id).toBe(addedId)
    })
  })

  it('still lets the user clear a field with a static default', async () => {
    // Guards the setSchemaDefaults/returnEmptyFields interaction: the fix must
    // not make validation resurrect ordinary `default` values the user removed
    expect(findInput('port').value).toBe('8080')

    type(findInput('port'), '')
    await settle()

    const data = emitted[emitted.length - 1]
    expect(data).not.toHaveProperty('port')
    expect(data.id).toMatch(UUID_PATTERN)
  })
})
