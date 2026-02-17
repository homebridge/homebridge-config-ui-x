import { ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit, signal } from '@angular/core'
import { Router } from '@angular/router'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { ITerminalOptions, Terminal } from '@xterm/xterm'
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/communication/api.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { SWITCH_TO_SCOPED_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  selector: 'app-switch-to-scoped',
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './switch-to-scoped.component.html',
  styleUrl: './switch-to-scoped.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SwitchToScopedComponent implements OnInit, OnDestroy {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private modalData = inject(SWITCH_TO_SCOPED_MODAL_DATA)

  // Public properties for component use
  public plugin = this.modalData.plugin

  // Signals
  public readonly installing = signal(false)
  public readonly installed = signal(false)
  public readonly uninstalling = signal(false)
  public readonly uninstalled = signal(false)
  public readonly restarting = signal(false)
  public readonly failure = signal<string>('')
  public readonly onlineUpdateOk = signal(false)

  // Other properties
  private io: IoNamespace
  private term: Terminal
  private termTarget: HTMLElement
  private fitAddon = new FitAddon()
  private webLinksAddon = new WebLinksAddon()
  private errorLog = ''

  public readonly moreInfo = '<a href="https://github.com/homebridge/plugins/wiki/Scoped-Plugins" target="_blank"><i class="fa fa-external-link-alt primary-text"></i></a>'
  public readonly prefix = '<span class="font-monospace">@homebridge-plugins/</span>'

  public get isLightTerminalTheme(): boolean {
    return this.$settings.getEffectiveTerminalLightingMode() === 'light'
  }

  constructor() {
    // Modals need independent settings from page terminals
    // Use terminal theme setting for text color to match terminal background
    const terminalTheme = this.$settings.getEffectiveTerminalLightingMode()
    this.term = new Terminal({
      fontSize: this.$settings.env.terminal?.fontSize || 13,
      fontWeight: (this.$settings.env.terminal?.fontWeight || '400') as ITerminalOptions['fontWeight'],
      lineHeight: 1.2,
      allowProposedApi: true,
      theme: {
        background: terminalTheme === 'light' ? '#00000000' : '#000000',
        foreground: terminalTheme === 'light' ? '#333333' : '#eeeeee',
      },
      allowTransparency: terminalTheme === 'light',
      screenReaderMode: true,
    })
    this.term.loadAddon(this.fitAddon)
    this.term.loadAddon(this.webLinksAddon)
  }

  public ngOnInit(): void {
    this.onlineUpdateOk.set(this.$settings.env.platform !== 'win32')
    this.io = this.$ws.connectToNamespace('plugins')
    this.termTarget = document.getElementById('plugin-output')
    this.term.open(this.termTarget)
    this.fitAddon.fit()

    this.io.socket.on('stdout', (data: string | Uint8Array) => {
      this.term.write(data)
      const dataCleaned = data
        .toString()
        .replace(/\x1B\[(\d{1,3}(;\d{1,2})?)?[mGK]/g, '') // eslint-disable-line no-control-regex
        .trimEnd()
      if (dataCleaned) {
        this.errorLog += `${dataCleaned}\r\n`
      }
    })
  }

  public async doSwitch(): Promise<void> {
    if (!this.plugin) {
      return
    }

    try {
      this.installing.set(true)

      // 1. Install new plugin
      await firstValueFrom(
        this.io.request('install', {
          name: this.plugin.newHbScope.to,
          version: this.plugin.newHbScope.switch,
          termCols: this.term.cols,
          termRows: this.term.rows,
        }),
      )

      this.installing.set(false)
      this.installed.set(true)
      this.uninstalling.set(true)

      // 2. Uninstall old plugin
      await firstValueFrom(
        this.io.request('uninstall', {
          name: this.plugin.newHbScope.from,
          termCols: this.term.cols,
          termRows: this.term.rows,
        }),
      )

      this.uninstalling.set(false)
      this.uninstalled.set(true)
      this.restarting.set(true)

      // 3. Set full service restart flag
      await this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {})

      this.$activeModal.close()
      void this.$router.navigate(['/restart'])
    } catch (error) {
      if (this.installing()) {
        this.installing.set(false)
      }
      if (this.uninstalling()) {
        this.uninstalling.set(false)
      }
      if (this.restarting()) {
        this.restarting.set(false)
      }

      const message = error instanceof Error ? error.message : 'An error occurred'
      this.failure.set(message)
      console.error(error)
      this.$toastr.error(message, this.$translate.instant('toast.title_error'))
    }
  }

  public downloadLogFile(): void {
    if (!this.plugin) {
      return
    }

    const blob = new Blob([this.errorLog], { type: 'text/plain;charset=utf-8' })
    saveAs(blob, `${this.plugin.name}-error.log`)
  }

  public ngOnDestroy(): void {
    this.io.end()
    this.term.dispose()
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }
}
