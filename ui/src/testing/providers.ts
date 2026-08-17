import type { Provider } from '@angular/core'

import type { FakeApi } from './fakes/api.fake'
import type { FakeAuth } from './fakes/auth.fake'
import type { FakeModalService } from './fakes/modal.fake'
import type { FakeSettings } from './fakes/settings.fake'
import type { FakeToastr } from './fakes/toastr.fake'
import type { FakeWs } from './fakes/ws.fake'

import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { provideTranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { AuthService } from '@/app/core/auth/auth.service'
import { ApiService } from '@/app/core/communication/api.service'
import { WsService } from '@/app/core/communication/ws.service'
import { SettingsService } from '@/app/core/ui/settings.service'

/**
 * Wire fakes to the tokens the app injects them under.
 *
 * Kept out of the `@/testing` barrel on purpose: it references the real
 * service classes, and a pure-function spec should not have to load them.
 */
export interface TestFakes {
  api?: FakeApi
  auth?: FakeAuth
  settings?: FakeSettings
  ws?: FakeWs
  toastr?: FakeToastr
  modal?: FakeModalService
  activeModal?: unknown
}

/**
 * Translation providers matching the app's own configuration.
 *
 * Nothing is loaded, so `translate.instant('toast.title_error')` returns the
 * key itself. Assert on keys, not on English copy - the copy changes.
 */
export function provideTestTranslate(): Provider[] {
  return provideTranslateService({
    fallbackLang: 'en',
    lang: 'en',
  }) as unknown as Provider[]
}

/**
 * Turn a set of fakes into TestBed providers.
 *
 *     TestBed.configureTestingModule({
 *       imports: [TheComponent],
 *       providers: [provideTestTranslate(), provideFakes({ api, settings })],
 *     })
 * @param fakes - the fakes to provide; anything omitted is left to the real DI
 */
export function provideFakes(fakes: TestFakes): Provider[] {
  const providers: Provider[] = []

  if (fakes.api) {
    providers.push({ provide: ApiService, useValue: fakes.api })
  }
  if (fakes.auth) {
    providers.push({ provide: AuthService, useValue: fakes.auth })
  }
  if (fakes.settings) {
    providers.push({ provide: SettingsService, useValue: fakes.settings })
  }
  if (fakes.ws) {
    providers.push({ provide: WsService, useValue: fakes.ws })
  }
  if (fakes.toastr) {
    providers.push({ provide: ToastrService, useValue: fakes.toastr })
  }
  if (fakes.modal) {
    providers.push({ provide: NgbModal, useValue: fakes.modal })
  }
  if (fakes.activeModal) {
    providers.push({ provide: NgbActiveModal, useValue: fakes.activeModal })
  }

  return providers
}
