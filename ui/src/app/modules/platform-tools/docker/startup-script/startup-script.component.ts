import { ApiService } from '@/app/core/api.service'
import { MobileDetectService } from '@/app/core/mobile-detect.service'
import { SettingsService } from '@/app/core/settings.service'
import { Component, OnDestroy, OnInit } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { NgxEditorModel } from 'ngx-monaco-editor'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './startup-script.component.html',
})
export class StartupScriptComponent implements OnInit, OnDestroy {
  public startupScript: string
  public saveInProgress: boolean
  public isMobile: any = false
  public options: any = { printMargin: false }

  public monacoEditor
  public editorOptions: any

  public monacoEditorModel: NgxEditorModel

  private lastHeight: number
  private visualViewPortEventCallback: () => void

  constructor(
    private $settings: SettingsService,
    private $api: ApiService,
    private $md: MobileDetectService,
    public $toastr: ToastrService,
    private translate: TranslateService,
    private $route: ActivatedRoute,
  ) {
    this.isMobile = this.$md.detect.mobile()
  }

  ngOnInit() {
    this.editorOptions = {
      language: 'shell',
      theme: this.$settings.theme.startsWith('dark-mode') ? 'vs-dark' : 'vs-light',
      automaticLayout: true,
    }

    // capture viewport events
    this.visualViewPortEventCallback = () => this.visualViewPortChanged()
    this.lastHeight = window.innerHeight

    if (window.visualViewport && !this.isMobile) {
      window.visualViewport.addEventListener('resize', this.visualViewPortEventCallback, true)
      this.$md.disableTouchMove()
    }

    this.$route.data.subscribe((data: { startupScript: { script: string } }) => {
      this.startupScript = data.startupScript.script
    })

    // setup the base monaco editor model
    this.monacoEditorModel = {
      value: '',
      language: 'shell',
    }
  }

  /**
   * Called when the monaco editor is ready
   */
  onEditorInit(editor) {
    this.monacoEditor = editor
    this.monacoEditor.getModel().setValue(this.startupScript)
  }

  async onSave() {
    if (this.saveInProgress) {
      return
    }

    this.saveInProgress = true

    // get the value from the editor
    if (!this.isMobile) {
      await this.monacoEditor.getAction('editor.action.formatDocument').run()
      this.startupScript = this.monacoEditor.getModel().getValue()
    }

    // check startup script is using the correct hashbang
    if (!['#!/bin/sh', '#!/bin/bash'].includes(this.startupScript.split('\n')[0].trim())) {
      this.$toastr.error(
        this.translate.instant('platform.docker.startup_script.toast_script_must_use_hashbang'),
        this.translate.instant('platform.docker.startup_script.toast_title_script_error'),
      )
      this.startupScript = `#!/bin/sh\n\n${this.startupScript}`

      if (!this.isMobile) {
        this.monacoEditor.getModel().setValue(this.startupScript)
      }
      this.saveInProgress = false
      return
    }

    try {
      await this.$api.put('/platform-tools/docker/startup-script', { script: this.startupScript }).toPromise()
      this.$toastr.success(
        this.translate.instant('platform.docker.startup_script.toast_restart_required'),
        this.translate.instant('platform.docker.startup_script.toast_title_script_saved'),
      )
    } catch (e) {
      this.$toastr.error(e.message, this.translate.instant('toast.title_error'))
    }

    this.saveInProgress = false
  }

  visualViewPortChanged() {
    if (this.lastHeight < window.visualViewport.height) {
      (document.activeElement as HTMLElement).blur()
    }

    if (window.visualViewport.height < window.innerHeight) {
      // keyboard may have opened
      this.$md.enableTouchMove()
      this.lastHeight = window.visualViewport.height
    } else if (window.visualViewport.height === window.innerHeight) {
      // keyboard is closed
      this.$md.disableTouchMove()
      this.lastHeight = window.visualViewport.height
    }
  }

  ngOnDestroy() {
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this.visualViewPortEventCallback, true)
      this.$md.enableTouchMove()
    }

    if (this.monacoEditor) {
      this.monacoEditor.dispose()
    }
  }
}
