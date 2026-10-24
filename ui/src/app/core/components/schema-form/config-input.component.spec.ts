import type { ComponentFixture } from '@angular/core/testing'

import { importProvidersFrom } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Bootstrap5FrameworkModule } from '@ng-formworks/bootstrap5'
import { TranslateService } from '@ngx-translate/core'
import { afterEach, describe, expect, it } from 'vitest'

import { SchemaFormComponent } from '@/app/core/components/schema-form/schema-form.component'
import { makeSettings } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

describe('plugin secret inputs', () => {
  let fixture: ComponentFixture<SchemaFormComponent>
  const data = () => ({
    name: 'Test plugin',
    password: 'dummy-password',
    apiKey: 'dummy-api-key',
    credential: 'dummy-credential',
    tokenRefreshInterval: '30',
  })

  function create(value = data()) {
    TestBed.configureTestingModule({
      imports: [SchemaFormComponent],
      providers: [
        provideTestTranslate(),
        provideFakes({
          settings: makeSettings(),
        }),
        importProvidersFrom(Bootstrap5FrameworkModule),
      ],
    })
    fixture = TestBed.createComponent(SchemaFormComponent)
    fixture.componentRef.setInput('configSchema', {
      schema: {
        type: 'object',
        required: ['password'],
        properties: {
          name: { type: 'string' },
          password: { type: 'string', minLength: 8 },
          apiKey: { type: 'string' },
          credential: { type: 'string', format: 'password', readOnly: true },
          tokenRefreshInterval: { type: 'string' },
        },
      },
    })
    fixture.componentRef.setInput('data', value)
    fixture.detectChanges()
    return value
  }

  function input(name: string): HTMLInputElement {
    return fixture.nativeElement.querySelector(`input[name="${name}"]`)
  }

  function toggle(control: HTMLInputElement): HTMLButtonElement {
    return fixture.nativeElement.querySelector(`button[aria-controls="${control.id}"]`)
  }

  afterEach(() => fixture?.destroy())

  it('masks declared and common secret fields while leaving ordinary input alone', () => {
    create()
    expect(input('name').type).toBe('text')
    expect(toggle(input('name'))).toBeNull()
    for (const name of ['password', 'apiKey', 'credential']) {
      expect(input(name).type).toBe('password')
      expect(input(name).getAttribute('spellcheck')).toBe('false')
      expect(toggle(input(name)).type).toBe('button')
    }
  })

  it('reveals one value without replacing its control or changing form data', () => {
    const value = create()
    const password = input('password')
    toggle(password).click()
    fixture.detectChanges()
    expect(input('password')).toBe(password)
    expect(password.type).toBe('text')
    expect(input('apiKey').type).toBe('password')
    expect(value).toEqual(data())
    toggle(password).click()
    fixture.detectChanges()
    expect(password.type).toBe('password')
    expect(password.value).toBe('dummy-password')
  })

  it('preserves edits and validation across hide and reveal', async () => {
    const value = create()
    const password = input('password')
    password.value = 'replacement-password'
    password.dispatchEvent(new Event('input', { bubbles: true }))
    fixture.detectChanges()
    await new Promise(resolve => setTimeout(resolve, 120))
    fixture.detectChanges()
    toggle(password).click()
    fixture.detectChanges()
    expect(password.value).toBe('replacement-password')
    expect(value.password).toBe('replacement-password')
    password.value = 'short'
    password.dispatchEvent(new Event('input', { bubbles: true }))
    fixture.detectChanges()
    expect(password.classList.contains('ng-invalid')).toBe(true)
    toggle(password).click()
    fixture.detectChanges()
    expect(password.classList.contains('ng-invalid')).toBe(true)
  })

  it('asks browsers and password managers not to fill a secret field with a saved login', () => {
    create()
    expect(input('password').getAttribute('autocomplete')).toBe('new-password')
    expect(input('name').getAttribute('autocomplete')).not.toBe('new-password')
  })

  it('leaves a setting about a secret alone, such as how often a token refreshes', () => {
    // The same name test as the JSON config page, which keeps these visible
    create()
    expect(input('tokenRefreshInterval').type).toBe('text')
    expect(toggle(input('tokenRefreshInterval'))).toBeNull()
  })

  it('names the field on each eye button, so they are not all just "show"', () => {
    create()
    const translate = TestBed.inject(TranslateService)
    translate.setTranslation('en', {
      'plugins.config.show_value': 'Show {{field}}',
      'plugins.config.hide_value': 'Hide {{field}}',
    }, true)
    translate.use('en')
    fixture.detectChanges()

    expect(toggle(input('password')).getAttribute('aria-label')).toBe('Show password')
    expect(toggle(input('apiKey')).getAttribute('aria-label')).toBe('Show apiKey')
  })
})
