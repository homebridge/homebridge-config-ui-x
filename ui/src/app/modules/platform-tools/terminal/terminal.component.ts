import { AfterViewInit, Component, ElementRef, HostListener, inject, OnDestroy, OnInit, viewChild } from '@angular/core'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { Subject } from 'rxjs'

import { SettingsService } from '@/app/core/settings.service'
import { TerminalNavigationGuardService } from '@/app/core/terminal-navigation-guard.service'
import { TerminalService } from '@/app/core/terminal.service'

@Component({
  templateUrl: './terminal.component.html',
  standalone: true,
  imports: [TranslatePipe],
})
export class TerminalComponent implements OnInit, AfterViewInit, OnDestroy {
  private $terminal = inject(TerminalService)
  private $settings = inject(SettingsService)
  private $navigationGuard = inject(TerminalNavigationGuardService)
  private $translate = inject(TranslateService)
  private resizeEvent = new Subject()

  readonly termTarget = viewChild<ElementRef>('terminaloutput')

  private visibilityChangeHandler: (() => void) | null = null

  @HostListener('window:resize', ['$event'])
  onWindowResize() {
    this.resizeEvent.next(undefined)
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    return this.$navigationGuard.handleBeforeUnload(event)
  }

  @HostListener('window:focus', ['$event'])
  onWindowFocus() {
    this.activateTerminal()
  }

  @HostListener('click', ['$event'])
  onClick() {
    this.activateTerminal()
  }

  private activateTerminal() {
    if (this.$terminal.isTerminalReady() && this.$terminal.term) {
      this.$terminal.term.focus()
    }
  }

  private patchXtermLiveRegion() {
    const host = this.termTarget()?.nativeElement as HTMLElement | undefined
    if (!host) return

    const live = host.querySelector('[aria-live]') as HTMLElement | null
    if (!live) return

    live.setAttribute('role', 'status')
    live.setAttribute('aria-live', 'polite')
    live.setAttribute('aria-atomic', 'true')
  }

  public ngOnInit() {
    const title = this.$translate.instant('menu.linux.label_terminal')
    this.$settings.setPageTitle(title)

    window.document.querySelector('body').classList.add('bg-black')

    if (this.$terminal.isTerminalReady()) {
      this.$terminal.destroyTerminal()
    }

    if (this.$settings.env.terminal?.persistence && this.$terminal.hasActiveSession()) {
      this.$terminal.reconnectTerminal(this.termTarget(), { screenReaderMode: true }, this.resizeEvent)
    } else {
      if (!this.$settings.env.terminal?.persistence && this.$terminal.hasActiveSession()) {
        this.$terminal.destroyPersistentSession()
      }
      this.$terminal.startTerminal(this.termTarget(), { screenReaderMode: true }, this.resizeEvent)
    }

    setTimeout(() => {
      this.patchXtermLiveRegion()
      this.activateTerminal()
    }, 100)
  }

  public ngAfterViewInit() {
    this.visibilityChangeHandler = this.onVisibilityChange.bind(this)
    document.addEventListener('visibilitychange', this.visibilityChangeHandler)

    setTimeout(() => {
      this.patchXtermLiveRegion()
    }, 0)
  }

  private onVisibilityChange() {
    if (!document.hidden && this.$terminal.isTerminalReady()) {
      setTimeout(() => {
        this.patchXtermLiveRegion()
        this.activateTerminal()
      }, 100)
    }
  }

  public canDeactivate(): Promise<boolean> | boolean {
    return this.$navigationGuard.canDeactivate()
  }

  public ngOnDestroy() {
    if (this.visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler)
      this.visibilityChangeHandler = null
    }

    window.document.querySelector('body').classList.remove('bg-black')

    if (this.$settings.env.terminal?.persistence) {
      this.$terminal.detachTerminal()
    } else {
      this.$terminal.destroyPersistentSession()
    }
  }
}
