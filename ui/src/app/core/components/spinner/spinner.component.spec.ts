import { TestBed } from '@angular/core/testing'
import { provideTranslateService } from '@ngx-translate/core'
import { beforeEach, describe, expect, it } from 'vitest'

import { SpinnerComponent } from '@/app/core/components/spinner/spinner.component'

describe('SpinnerComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SpinnerComponent],
      providers: [
        provideTranslateService({
          fallbackLang: 'en',
          lang: 'en',
        }),
      ],
    })
  })

  it('renders the spinner with an accessible loading label', () => {
    const fixture = TestBed.createComponent(SpinnerComponent)
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement
    const container = element.querySelector('.app-spinner-container')
    expect(container).not.toBeNull()
    expect(container!.getAttribute('role')).toBe('status')
    expect(element.querySelectorAll('circle')).toHaveLength(2)
  })
})
