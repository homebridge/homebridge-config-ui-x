import { TestBed } from '@angular/core/testing'
import { beforeEach, describe, expect, it } from 'vitest'

import { HttpErrorService } from '@/app/core/utilities/http-error.service'
import { provideTestTranslate } from '@/testing/providers'

describe('HttpErrorService', () => {
  let service: HttpErrorService

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideTestTranslate()],
    })
    service = TestBed.inject(HttpErrorService)
  })

  it('shows the message the server sent', () => {
    expect(service.toToastMessage({ error: { message: 'Username already taken' } })).toBe('Username already taken')
  })

  it.each([
    ['a blank server message', { error: { message: '   ' } }],
    ['a non-string server message', { error: { message: { detail: 'nope' } } }],
    ['no error body', { status: 500 }],
    ['a locally thrown error', new Error('LevelControl cluster not found')],
    ['null', null],
    ['undefined', undefined],
  ])('falls back to the generic message for %s', (_case, err) => {
    // Nothing is loaded in tests, so translate returns the key itself - which
    // is the point: the assertion pins the key, not the English wording
    expect(service.toToastMessage(err)).toBe('toast.api_error_generic')
  })
})
