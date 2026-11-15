import type { FakeModalService } from '@/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { describe, expect, it, vi } from 'vitest'

import { CONFIRMED_ACTION_STATE } from '@/app/core/utilities/confirmed-action'
import { PowerOptionsComponent } from '@/app/modules/power-options/power-options.component'
import { fakeApi, makeSettings, modalServiceSpy, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The power menu. Rebooting or shutting down the machine takes everything offline for a while (or, for a shut
 * down, until someone switches it back on), so both ask first.
 */
describe('powerOptionsComponent', () => {
  let modal: FakeModalService
  let navigate: ReturnType<typeof vi.fn>

  function open() {
    TestBed.resetTestingModule()
    modal = modalServiceSpy()
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTranslate(),
        provideFakes({
          api: fakeApi(),
          settings: makeSettings(),
          toastr: toastrStub(),
          modal,
        }),
      ],
    })
    TestBed.overrideComponent(PowerOptionsComponent, {
      set: {
        imports: [TranslatePipe],
        schemas: [NO_ERRORS_SCHEMA],
      },
    })
    navigate = vi.fn(async () => true)
    vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(navigate as any)
    return TestBed.createComponent(PowerOptionsComponent).componentInstance
  }

  it('asks before restarting the operating system, and does nothing when the user says no', async () => {
    const page = open()

    const restarting = page.restartServer()
    expect(modal.open).toHaveBeenCalledOnce()
    modal.lastOpened()!.ref.dismiss()
    await restarting

    expect(navigate).not.toHaveBeenCalled()
  })

  it('restarts the operating system once the user confirms', async () => {
    const page = open()

    const restarting = page.restartServer()
    modal.lastOpened()!.ref.close(true)
    await restarting

    expect(navigate).toHaveBeenCalledWith(['/platform-tools/linux/restart-server'], { state: CONFIRMED_ACTION_STATE })
  })
})
