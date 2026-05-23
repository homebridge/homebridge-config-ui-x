import { HttpResponse } from '@angular/common/http'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, createEnvironmentInjector, DestroyRef, ElementRef, EnvironmentInjector, inject, input, OnDestroy, OnInit, signal, viewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ITerminalOptions } from '@xterm/xterm'
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr'
import { Subject } from 'rxjs'

import { AuthService } from '@/app/core/auth/auth.service'
import { ApiService } from '@/app/core/communication/api.service'
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { CONFIRM_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { SettingsService } from '@/app/core/ui/settings.service'
import { LogService } from '@/app/core/utilities/log.service'
import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  selector: 'app-homebridge-logs-widget',
  imports: [
    NgbTooltip,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './homebridge-logs-widget.component.html',
  styleUrl: './homebridge-logs-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomebridgeLogsWidgetComponent implements OnInit, OnDestroy {
  // Injected dependencies
  private destroyRef = inject(DestroyRef)
  private injector = inject(EnvironmentInjector)
  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $log = inject(LogService)
  private $modal = inject(NgbModal)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $cdr = inject(ChangeDetectorRef)

  // Signals
  readonly widget = input.required<Widget>()
  readonly widgetContainerElement = viewChild<ElementRef>('widgetcontainer')
  readonly titleElement = viewChild<ElementRef>('terminaltitle')
  readonly termTarget = viewChild<ElementRef>('logoutput')
  public readonly terminalHeight = signal<number>(200)
  public readonly theme = signal<'dark' | 'light'>('dark')

  // Other properties
  public isAdmin = this.$auth.user.admin
  private initialized = false
  resizeEvent!: Subject<void> // Set directly by ComponentFactoryResolver
  configureEvent!: Subject<void> // Set directly by ComponentFactoryResolver

  public ngOnInit(): void {
    // Use effective theme to enforce dark mode override when needed
    this.theme.set(this.$settings.getEffectiveTerminalLightingMode())
    setTimeout(() => {
      // Use global terminal settings from settings service
      this.$log.startTerminal(this.termTarget()!, this.$settings.getTerminalOptions({
        cursorBlink: false,
      }, true), this.resizeEvent)

      // Mark as initialized after terminal setup completes
      this.initialized = true

      // Trigger initial resize to calculate height and fit terminal
      setTimeout(() => {
        this.resizeEvent.next()
      }, 100)
    })

    this.resizeEvent.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      // Skip resize updates until component is fully initialized
      if (!this.initialized) {
        return
      }
      this.terminalHeight.set(this.getTerminalHeight())
    })

    // Note: Widget-specific configuration (fontSize, fontWeight, theme) is not implemented
    // Only global terminal settings via terminalSettingsSubscription are functional
    this.configureEvent.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      // Reserved for future widget-specific configuration if needed
    })

    // Subscribe to global terminal settings changes
    this.$settings.terminalSettingsChanged.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (settings) => {
        if (!this.$log.term) {
          return
        }
        let changed = false
        if (settings.fontSize && this.$log.term.options.fontSize !== settings.fontSize) {
          this.$log.term.options.fontSize = settings.fontSize
          changed = true
        }
        if (settings.fontWeight && this.$log.term.options.fontWeight !== settings.fontWeight) {
          this.$log.term.options.fontWeight = settings.fontWeight as ITerminalOptions['fontWeight']
          changed = true
        }
        if (settings.lightingMode !== undefined) {
          const themeOptions = this.$settings.getTerminalThemeOptions(true)
          this.$log.term.options.theme = themeOptions.theme
          this.$log.term.options.allowTransparency = themeOptions.allowTransparency
          changed = true

          // Trigger change detection for template bindings (background color, etc.)
          this.$cdr.markForCheck()
        }
        if (changed) {
          this.resizeEvent.next(undefined)
          setTimeout(() => {
            this.$log.term.scrollToBottom()
          }, 100)
        }
      },
    })
  }

  public ngOnDestroy(): void {
    this.$log.destroyTerminal()
  }

  public async downloadLogFile(): Promise<void> {
    const injector = createEnvironmentInjector([{
      provide: CONFIRM_MODAL_DATA,
      useValue: {
        title: this.$translate.instant('logs.title_download_log_file'),
        message: this.$translate.instant('logs.download_warning'),
        confirmButtonLabel: this.$translate.instant('form.button_download'),
        faIconClass: 'fas fa-user-secret primary-text',
      },
    }], this.injector)

    const ref = this.$modal.open(ConfirmComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      await ref.result
      try {
        const res = await this.$api.get('/platform-tools/hb-service/log/download', { observe: 'response', responseType: 'blob' }) as HttpResponse<Blob>
        saveAs(res.body!, 'homebridge.log.txt')
      } catch (err) {
        let message: string | undefined
        try {
          if (err && typeof err === 'object' && 'error' in err) {
            const errorText = await (err as { error: Blob }).error.text()
            message = JSON.parse(errorText).message
          }
        } catch (error) {
          console.error(error)
        }
        this.$toastr.error(message || this.$translate.instant('logs.download.error'), this.$translate.instant('toast.title_error'))
      }
    } catch {
      // Modal dismissed, do nothing
    }
  }

  public async truncateLogFile(): Promise<void> {
    const injector = createEnvironmentInjector([{
      provide: CONFIRM_MODAL_DATA,
      useValue: {
        title: this.$translate.instant('logs.title_truncate_log_file'),
        message: this.$translate.instant('logs.truncate_log_warning'),
        confirmButtonLabel: this.$translate.instant('form.button_delete'),
        confirmButtonClass: 'btn-danger',
        faIconClass: 'fas fa-circle-exclamation primary-text',
      },
    }], this.injector)

    const ref = this.$modal.open(ConfirmComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      await ref.result
      try {
        await this.$api.put('/platform-tools/hb-service/log/truncate', {})
        this.$toastr.success(
          this.$translate.instant('logs.log_file_truncated'),
          this.$translate.instant('toast.title_success'),
        )
        this.$log.term.clear()
      } catch (error) {
        console.error(error)
        const message = (error && typeof error === 'object' && 'error' in error && error.error && typeof error.error === 'object' && 'message' in error.error)
          ? String(error.error.message)
          : this.$translate.instant('logs.truncate.error')
        this.$toastr.error(message, this.$translate.instant('toast.title_error'))
      }
    } catch {
      // Modal dismissed, do nothing
    }
  }

  private getTerminalHeight(): number {
    const widgetContainerHeight = (this.widgetContainerElement()!.nativeElement as HTMLElement).offsetHeight
    const titleHeight = (this.titleElement()!.nativeElement as HTMLElement).offsetHeight
    return widgetContainerHeight - titleHeight
  }
}
