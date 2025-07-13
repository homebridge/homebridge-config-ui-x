import { Component, ElementRef, HostListener, inject, OnDestroy, OnInit, viewChild } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { Subject } from 'rxjs'

import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { SettingsService } from '@/app/core/settings.service'
import { TerminalService } from '@/app/core/terminal.service'

@Component({
  templateUrl: './terminal.component.html',
  standalone: true,
  imports: [TranslatePipe],
})
export class TerminalComponent implements OnInit, OnDestroy {
  private $terminal = inject(TerminalService)
  private $settings = inject(SettingsService)
  private $modal = inject(NgbModal)
  private $translate = inject(TranslateService)
  private resizeEvent = new Subject()

  readonly termTarget = viewChild<ElementRef>('terminaloutput')

  @HostListener('window:resize', ['$event'])
  onWindowResize() {
    this.resizeEvent.next(undefined)
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    // Only show warning if persistence is disabled, warning is enabled, and there's an active session
    if (!this.$settings.terminalPersistence
      && this.$settings.terminalShowWarning
      && this.$terminal.hasActiveSession()) {
      const message = this.$translate.instant('platform.terminal.beforeunload_message')
      event.preventDefault()
      event.returnValue = message // For Chrome
      return message // For other browsers
    }
    return undefined
  }

  public ngOnInit() {
    // Set body bg color
    window.document.querySelector('body').classList.add('bg-black')

    // If terminal is already ready, use reconnectTerminal for proper session management
    if (this.$terminal.isTerminalReady()) {
      this.$terminal.reconnectTerminal(this.termTarget(), {}, this.resizeEvent)
      setTimeout(() => {
        if (this.$terminal.term) {
          this.$terminal.term.focus()
        }
      }, 100)
      return
    }

    // Start or reconnect to the terminal
    if (this.$settings.terminalPersistence && this.$terminal.hasActiveSession()) {
      this.$terminal.reconnectTerminal(this.termTarget(), {}, this.resizeEvent)
    } else {
      this.$terminal.startTerminal(this.termTarget(), {}, this.resizeEvent)
    }

    // Set focus to the terminal after a delay to ensure it's initialized
    setTimeout(() => {
      if (this.$terminal.term) {
        this.$terminal.term.focus()
      }
    }, 100)
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

    // Show confirmation dialog when persistence is disabled, warning is enabled, and there's an active session
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
    ref.componentInstance.faIconClass
      = 'fas fa-exclamation-triangle text-warning'

    return ref.result.then(() => true).catch(() => false)
  }

  public ngOnDestroy() {
    // Unset body bg color
    window.document.querySelector('body').classList.remove('bg-black')

    // Use persistence setting to determine behavior
    if (this.$settings.terminalPersistence) {
      // Detach the terminal but keep the session alive
      this.$terminal.detachTerminal()
    } else {
      // Destroy the terminal completely
      this.$terminal.destroyTerminal()
    }
  }
}
