import { ApiService } from '@/app/core/api.service'
import { SettingsService } from '@/app/core/settings.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'
import { Component, Input, OnDestroy, OnInit } from '@angular/core'
import { Router } from '@angular/router'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'

@Component({
  templateUrl: './switch-to-scoped.component.html',
  styleUrls: ['./switch-to-scoped.component.scss'],
})
export class SwitchToScopedComponent implements OnInit, OnDestroy {
  @Input() plugin: any

  public installing = false
  public installed = false
  public uninstalling = false
  public uninstalled = false
  public restarting = false
  public failure: string = ''
  public onlineUpdateOk: boolean
  public moreInfo = '<a href="https://github.com/homebridge/plugins/wiki/Scoped-Plugins" target="_blank"><i class="fa fa-fw fa-external-link-alt"></i></a>'

  private io: IoNamespace
  private term: Terminal
  private termTarget: HTMLElement
  private fitAddon = new FitAddon()
  private errorLog = ''

  constructor(
    public $activeModal: NgbActiveModal,
    private $api: ApiService,
    private $router: Router,
    public $settings: SettingsService,
    private $toastr: ToastrService,
    private $translate: TranslateService,
    private $ws: WsService,
  ) {
    this.term = new Terminal({
      theme: {
        background: '#00000000',
        foreground: this.$settings.actualLightingMode === 'light' ? '#333333' : '#eeeeee',
        cursor: '#d2d2d2',
        selection: '#d2d2d2',
      },
      allowTransparency: true,
    })
    this.term.loadAddon(this.fitAddon)
  }

  ngOnInit(): void {
    this.onlineUpdateOk = this.$settings.env.platform !== 'win32'
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

  doSwitch() {
    this.installing = true

    // 1. Install new plugin
    this.io.request('install', {
      name: this.plugin.newHbScope.to,
      version: this.plugin.newHbScope.switch,
      termCols: this.term.cols,
      termRows: this.term.rows,
    }).subscribe({
      next: () => {
        this.installing = false
        this.installed = true
        this.uninstalling = true

        // 1. Install new plugin
        this.io.request('uninstall', {
          name: this.plugin.newHbScope.from,
          termCols: this.term.cols,
          termRows: this.term.rows,
        }).subscribe({
          next: () => {
            this.uninstalling = false
            this.uninstalled = true
            this.restarting = true

            this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
              next: () => {
                this.$activeModal.close()
                this.$router.navigate(['/restart'])
              },
              error: (error) => {
                this.restarting = false
                this.failure = error.message
                console.error(error)
                this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
              },
            })
          },
          error: (error) => {
            this.uninstalling = false
            this.failure = error.message
            console.error(error)
            this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
          },
        })
      },
      error: (error) => {
        this.installing = false
        this.failure = error.message
        console.error(error)
        this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      },
    })
  }

  downloadLogFile() {
    const blob = new Blob([this.errorLog], { type: 'text/plain;charset=utf-8' })
    saveAs(blob, `${this.plugin.name}-error.log`)
  }

  ngOnDestroy() {
    this.io.end()
    this.term.dispose()
  }
}
