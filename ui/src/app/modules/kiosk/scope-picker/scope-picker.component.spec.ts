import type { KioskScope } from '@/app/modules/kiosk/kiosk-scope'
import type { ComponentFixture } from '@angular/core/testing'

import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { beforeEach, describe, expect, it } from 'vitest'

import { provideTestTranslate } from '@/testing/providers'

import { ScopePickerComponent } from './scope-picker.component'

/** The rooms, categories, subcategories and labels picker shared by the tablet and kiosk dialogs */
describe('scopePickerComponent', () => {
  let fixture: ComponentFixture<ScopePickerComponent>

  const empty: KioskScope = {
    rooms: [],
    categories: [],
    subcategories: [],
    labels: [],
  }

  function setup(scope: KioskScope = empty): void {
    fixture = TestBed.createComponent(ScopePickerComponent)
    fixture.componentRef.setInput('scope', scope)
    fixture.componentRef.setInput('rooms', ['Kitchen', 'Hall'])
    fixture.componentRef.setInput('labels', ['Night'])
    fixture.detectChanges()
  }

  function button(label: string): HTMLButtonElement | undefined {
    return [
      ...fixture.nativeElement.querySelectorAll('button'),
    ].find(
      (element: HTMLButtonElement) => element.textContent!.trim() === label,
    ) as HTMLButtonElement | undefined
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ScopePickerComponent],
      providers: [
        provideTestTranslate(),
      ],
    })
    TestBed.inject(TranslateService).setTranslation('en', {
      'kiosk.tablets.rooms': 'Rooms',
      'kiosk.tablets.categories': 'Categories',
      'kiosk.tablets.labels': 'Labels',
      'accessories.categories.lights': 'Lights',
      'accessories.subcategories.onoff': 'On/off',
      'accessories.subcategories.dimmable': 'Dimmable',
    }, true)
  })

  it('shows every room and label as a pill, with the picked ones pressed', () => {
    setup({
      ...empty,
      rooms: ['Hall'],
    })

    expect(button('Kitchen')!.getAttribute('aria-pressed')).toBe('false')
    expect(button('Hall')!.getAttribute('aria-pressed')).toBe('true')
    expect(button('Night')).toBeDefined()
  })

  it('adds and removes a room in the scope', () => {
    setup({
      ...empty,
      rooms: ['Hall'],
    })

    button('Kitchen')!.click()
    expect(fixture.componentInstance.scope()).toEqual({
      ...empty,
      rooms: ['Hall', 'Kitchen'],
    })

    button('Hall')!.click()
    expect(fixture.componentInstance.scope()).toEqual({
      ...empty,
      rooms: ['Kitchen'],
    })
  })

  it('shows subcategory pills under a picked category only', () => {
    setup()
    expect(button('On/off')).toBeUndefined()

    button('Lights')!.click()
    fixture.detectChanges()

    expect(button('On/off')).toBeDefined()
    expect(button('Dimmable')).toBeDefined()
  })

  it('drops a category subcategories when the category is deselected', () => {
    setup({
      ...empty,
      categories: ['lights'],
      subcategories: ['onoff'],
    })

    button('Lights')!.click()

    expect(fixture.componentInstance.scope()).toEqual(empty)
  })

  it('picks a label', () => {
    setup()

    button('Night')!.click()

    expect(fixture.componentInstance.scope()).toEqual({
      ...empty,
      labels: ['Night'],
    })
  })
})
