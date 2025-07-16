import { inject, Injectable } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'

import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { SettingsService } from '@/app/core/settings.service'
import { TerminalService } from '@/app/core/terminal.service'

@Injectable({
  providedIn: 'root',
})
export class TerminalNavigationGuardService {
  private $terminal = inject(TerminalService)
  private $settings = inject(SettingsService)
  private $modal = inject(NgbModal)
  private $translate = inject(TranslateService)

  public handleBeforeUnload(event: BeforeUnloadEvent): string | undefined {
    // Only show warning if persistence is disabled, warning is enabled, there's an active session, and user has typed
    if (!this.$settings.terminalPersistence
      && this.$settings.terminalShowWarning
      && this.$terminal.hasActiveSession()
      && this.$terminal.hasUserTypedInSession()) {
      const message = this.$translate.instant('platform.terminal.beforeunload_message')
      event.preventDefault()
      event.returnValue = message
      return message // For other browsers
    }
    return undefined
  }

  public canDeactivate(): Promise<boolean> | boolean {
    // If persistence is enabled, allow navigation without prompt
    if (this.$settings.terminalPersistence) {
      return true
    }

    // If warning is disabled, allow navigation without prompt (preserve current behavior)
    if (!this.$settings.terminalShowWarning) {
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
    const ref = this.$modal.open(ConfirmComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.title = this.$translate.instant(
      'platform.terminal.confirm_navigation_title',
    )
    ref.componentInstance.message = this.$translate.instant(
      'platform.terminal.confirm_navigation_message',
    )
    ref.componentInstance.confirmButtonLabel = this.$translate.instant(
      'platform.terminal.confirm_navigation_button',
    )
    ref.componentInstance.cancelButtonLabel = this.$translate.instant(
      'form.button_cancel',
    )
    ref.componentInstance.confirmButtonClass = 'btn-warning'
    ref.componentInstance.faIconClass = 'fas fa-exclamation-triangle text-warning'

    return ref.result.then(() => true).catch(() => false)
  }
}
