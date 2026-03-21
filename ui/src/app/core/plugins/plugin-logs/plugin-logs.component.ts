import { HttpErrorResponse, HttpResponse } from '@angular/common/http'
import { Component, createEnvironmentInjector, ElementRef, EnvironmentInjector, HostListener, inject, OnDestroy, OnInit, signal, viewChild } from '@angular/core'
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr'
import { Subject } from 'rxjs'

import { ApiService } from '@/app/core/communication/api.service'
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { CONFIRM_MODAL_DATA, PLUGIN_LOGS_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { ChildBridge } from '@/app/core/plugins/manage-plugins.interfaces'
import { SettingsService } from '@/app/core/ui/settings.service'
import { LogService } from '@/app/core/utilities/log.service'

// eslint-disable-next-line no-control-regex
const RE_ANSI = /\x1B\[(\d{1,3}(;\d{1,2})?)?[mGK]/g
const RE_BRACKET_TAG = /36m\[.*?\]/

@Component({
  templateUrl: './plugin-logs.component.html',
  standalone: true,
  imports: [TranslatePipe, NgbTooltip],
})
export class PluginLogsComponent implements OnInit, OnDestroy {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $log = inject(LogService)
  private $modal = inject(NgbModal)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $settings = inject(SettingsService)
  private injector = inject(EnvironmentInjector)
  private modalData = inject(PLUGIN_LOGS_MODAL_DATA)

  // ViewChild queries
  readonly termTarget = viewChild<ElementRef>('pluginlogoutput')

  // Public properties (from injected data)
  public plugin = this.modalData.plugin
  public childBridges: ChildBridge[] = this.modalData.childBridges ?? []

  // Signals
  public midAction = signal(false)

  // Other properties
  private resizeEvent = new Subject<void>()
  private pluginAlias: string

  public get isLightTerminalTheme(): boolean {
    return this.$settings.getEffectiveTerminalLightingMode() === 'light'
  }

  // Lifecycle
  public ngOnInit(): void {
    void this.getPluginLog()
  }

  public ngOnDestroy(): void {
    this.$log.destroyTerminal()
  }

  // HostListener
  @HostListener('window:resize')
  onWindowResize(): void {
    this.resizeEvent.next(undefined)
  }

  // Public methods
  public async restartChildBridges(): Promise<void> {
    this.midAction.set(true)
    try {
      for (const bridge of this.childBridges) {
        await this.$api.put(`/server/restart/${bridge.username}`, {})
      }
      this.$toastr.success(
        this.$translate.instant('plugins.manage.child_bridge_restart'),
        this.$translate.instant('toast.title_success'),
      )
      this.midAction.set(false)
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('plugins.manage.child_bridge_restart_failed'), this.$translate.instant('toast.title_error'))
      this.midAction.set(false)
    }
  }

  public async downloadLogFile(): Promise<void> {
    this.midAction.set(true)
    const modalInjector = createEnvironmentInjector([{
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
      injector: modalInjector,
    })

    try {
      await ref.result
      try {
        const res: HttpResponse<any> = await this.$api.get('/platform-tools/hb-service/log/download?colour=yes', { observe: 'response', responseType: 'text' })
        if (!res.body) {
          return
        }
        const lines = res.body.split('\n')
        let finalOutput = ''
        let includeNextLine = false

        lines.forEach((line: string) => {
          if (!line) {
            return
          }

          if (includeNextLine) {
            if (RE_BRACKET_TAG.test(line)) {
              includeNextLine = false
            } else {
              finalOutput += `${line.replace(RE_ANSI, '')}\r\n`
              return
            }
          }

          if (line.includes(`36m[${this.pluginAlias}]`)) {
            finalOutput += `${line.replace(RE_ANSI, '')}\r\n`
            includeNextLine = true
          }
        })

        if (this.plugin) {
          saveAs(new Blob([finalOutput], { type: 'text/plain;charset=utf-8' }), `${this.plugin.name}.log.txt`)
        }
        this.midAction.set(false)
      } catch (err: any) {
        let message: string | undefined
        try {
          if (err instanceof HttpErrorResponse && err.error?.text) {
            message = JSON.parse(await err.error.text()).message
          }
        } catch (error) {
          console.error(error)
        }
        this.$toastr.error(message || this.$translate.instant('logs.download.error'), this.$translate.instant('toast.title_error'))
        this.midAction.set(false)
      }
    } catch {
      this.midAction.set(false)
    }
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  // Private methods
  private async getPluginLog(): Promise<void> {
    // Get the plugin name as configured in the config file
    if (!this.plugin) {
      return
    }
    try {
      const result = await this.$api.get(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`)
      if (!this.plugin) {
        return
      }
      this.pluginAlias = this.plugin.name === 'homebridge-config-ui-x' ? 'Homebridge UI' : (result[0]?.name || this.plugin.name)
      this.$log.startTerminal(this.termTarget(), this.$settings.getTerminalOptions(), this.resizeEvent, this.pluginAlias)
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? (error as any).error?.message || error.message : this.$translate.instant('toast.title_error')
      this.$toastr.error(message, this.$translate.instant('toast.title_error'))
      this.$activeModal.dismiss()
    }
  }
}
