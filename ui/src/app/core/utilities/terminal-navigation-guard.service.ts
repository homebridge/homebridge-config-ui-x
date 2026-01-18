import { createEnvironmentInjector, EnvironmentInjector, inject, Injectable } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslateService } from '@ngx-translate/core'

import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { CONFIRM_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { SettingsService } from '@/app/core/ui/settings.service'
import { TerminalService } from '@/app/core/utilities/terminal.service'

@Injectable({
  providedIn: 'root',
})
export class TerminalNavigationGuardService {
  private injector = inject(EnvironmentInjector)
  private $terminal = inject(TerminalService)
  private $settings = inject(SettingsService)
  private $modal = inject(NgbModal)
  private $translate = inject(TranslateService)

  public handleBeforeUnload(event: BeforeUnloadEvent): string | undefined {
    // Only show warning if persistence is disabled, warning is enabled, there's an active session, and user has typed
    if (
      !this.$settings.env.terminal?.persistence
      && !this.$settings.env.terminal?.hideWarning
      && this.$terminal.hasActiveSession()
      && this.$terminal.hasUserTypedInSession()
    ) {
      const message = this.$translate.instant('platform.terminal.terminate_unload')
      event.preventDefault()
      event.returnValue = message
      return message // For other browsers
    }
    return undefined
  }

  public async canDeactivate(): Promise<boolean> {
    // If persistence is enabled, allow navigation without prompt
    if (this.$settings.env.terminal?.persistence) {
      return true
    }

    // If warning is disabled, allow navigation without prompt (preserve current behavior)
    if (this.$settings.env.terminal?.hideWarning) {
      return true
    }

    // If there's no active session, allow navigation without prompt
    if (!this.$terminal.hasActiveSession()) {
      return true
    }

    // If user hasn't typed anything, allow navigation without prompt
    if (!this.$terminal.hasUserTypedInSession()) {
      return true
    }

    // Show confirmation dialog when persistence is disabled, warning is enabled, there's an active session, and user has typed
    const injector = createEnvironmentInjector([{
      provide: CONFIRM_MODAL_DATA,
      useValue: {
        title: this.$translate.instant('platform.terminal.terminate_title'),
        message: this.$translate.instant('platform.terminal.terminate_message_1'),
        message2: this.$translate.instant('platform.terminal.terminate_message_2'),
        message3: this.$translate.instant('common.phrases.are_you_sure'),
        confirmButtonLabel: this.$translate.instant('form.button_continue'),
        confirmButtonClass: 'btn-primary',
        faIconClass: 'fas fa-exclamation-triangle text-warning',
      },
    }], this.injector)

    const ref = this.$modal.open(ConfirmComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      await ref.result
      return true
    } catch {
      return false
    }
  }
}
