import type { NetworkAdapterAvailable, NetworkAdapterSelected } from '@/app/modules/settings/settings.interfaces'

import { animate, style, transition, trigger } from '@angular/animations'
import { NgClass, TitleCasePipe } from '@angular/common'
import { ChangeDetectorRef, Component, ElementRef, inject, OnInit, ViewChild } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule, UntypedFormControl } from '@angular/forms'
import { Router, RouterLink } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { isStandalonePWA } from 'is-standalone-pwa'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

import { ApiService } from '@/app/core/api.service'
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { SpinnerComponent } from '@/app/core/components/spinner/spinner.component'
import { NotificationService } from '@/app/core/notification.service'
import { SettingsService } from '@/app/core/settings.service'
import { TerminalService } from '@/app/core/terminal.service'
import { AccessoryControlListsComponent } from '@/app/modules/settings/accessory-control-lists/accessory-control-lists.component'
import { BackupComponent } from '@/app/modules/settings/backup/backup.component'
import { RemoveAllAccessoriesComponent } from '@/app/modules/settings/remove-all-accessories/remove-all-accessories.component'
import { RemoveBridgeAccessoriesComponent } from '@/app/modules/settings/remove-bridge-accessories/remove-bridge-accessories.component'
import { RemoveIndividualAccessoriesComponent } from '@/app/modules/settings/remove-individual-accessories/remove-individual-accessories.component'
import { ResetAllBridgesComponent } from '@/app/modules/settings/reset-all-bridges/reset-all-bridges.component'
import { ResetIndividualBridgesComponent } from '@/app/modules/settings/reset-individual-bridges/reset-individual-bridges.component'
import { SelectNetworkInterfacesComponent } from '@/app/modules/settings/select-network-interfaces/select-network-interfaces.component'
import { WallpaperComponent } from '@/app/modules/settings/wallpaper/wallpaper.component'

@Component({
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    RouterLink,
    FormsModule,
    ReactiveFormsModule,
    TitleCasePipe,
    TranslatePipe,
    SpinnerComponent,
  ],
  animations: [
    trigger('fadeInOut', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('750ms', style({ opacity: 1 })),
      ]),
      transition(':leave', [
        animate('750ms', style({ opacity: 0 })),
      ]),
    ]),
    trigger('smoothHide', [
      transition(':enter', [
        style({
          opacity: 0.01,
          height: '0px',
          overflow: 'hidden',
          marginBottom: 0,
          transform: 'scale(0.97)',
        }),
        animate('450ms cubic-bezier(0.0, 0.0, 0.2, 1)', style({
          opacity: 1,
          height: '*',
          marginBottom: '*',
          transform: 'scale(1)',
        })),
      ]),
      transition(':leave', [
        animate('150ms cubic-bezier(0.4, 0.0, 1, 1)', style({
          opacity: 0,
          height: 0,
          marginBottom: 0,
          paddingTop: 0,
          paddingBottom: 0,
          overflow: 'hidden',
          transform: 'scale(0.98)',
        })),
      ]),
    ]),
  ],
})
export class SettingsComponent implements OnInit {
  @ViewChild('searchInput') searchInput!: ElementRef

  private $api = inject(ApiService)
  private $cdr = inject(ChangeDetectorRef)
  private $modal = inject(NgbModal)
  private $notification = inject(NotificationService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $terminal = inject(TerminalService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private restartToastIsShown = false

  public showSearchBar = false
  public searchQuery = ''

  public showFields = {
    general: true,
    display: true,
    startup: true,
    network: true,
    security: true,
    terminal: true,
    reset: true,
    cache: true,
  }

  // Track which items are hidden by search
  public hiddenItems: Record<string, boolean> = {}

  public loading = true
  public isHbV2 = false
  public showAvahiMdnsOption = false
  public showResolvedMdnsOption = false
  public adaptersAvailable: NetworkAdapterAvailable[] = []
  public adaptersSelected: NetworkAdapterSelected[] = []
  public showPfxPassphrase = false
  public runningInDocker = this.$settings.env.runningInDocker
  public runningOnRaspberryPi = this.$settings.env.runningOnRaspberryPi
  public platform = this.$settings.env.platform
  public enableTerminalAccess = this.$settings.env.enableTerminalAccess
  public isPwa = Boolean(isStandalonePWA())

  public hbNameIsInvalid = false
  public hbNameIsSaving = false
  public hbNameFormControl = new FormControl('')

  public uiLangIsSaving = false
  public uiLangFormControl = new FormControl('')

  public uiThemeIsSaving = false
  public uiThemeFormControl = new FormControl('')

  public uiLightIsSaving = false
  public uiLightFormControl = new FormControl('')

  public uiMenuIsSaving = false
  public uiMenuFormControl = new FormControl('')

  public uiTempIsSaving = false
  public uiTempFormControl = new FormControl('')

  public uiAlwaysShowBetasIsSaving = false
  public uiAlwaysShowBetasFormControl = new FormControl(false)

  public uiTerminalPersistenceIsSaving = false
  public uiTerminalPersistenceFormControl = new FormControl(false)

  public uiTerminalHideWarningIsSaving = false
  public uiTerminalHideWarningFormControl = new FormControl(false)

  public uiTerminalBufferSizeIsSaving = false
  public uiTerminalBufferSizeIsInvalid = false
  public uiTerminalBufferSizeFormControl = new FormControl(globalThis.terminal.bufferSize)

  public hbDebugIsSaving = false
  public hbDebugFormControl = new FormControl(false)

  public hbInsecureIsSaving = false
  public hbInsecureFormControl = new FormControl(false)

  public hbKeepIsSaving = false
  public hbKeepFormControl = new FormControl(false)

  public hbEnvDebugIsSaving = false
  public hbEnvDebugFormControl = new FormControl('')

  public hbEnvNodeIsSaving = false
  public hbEnvNodeFormControl = new FormControl('')

  public hbLogSizeIsInvalid = false
  public hbLogSizeIsSaving = false
  public hbLogSizeFormControl = new FormControl(-1)

  public hbLogTruncateIsInvalid = false
  public hbLogTruncateIsSaving = false
  public hbLogTruncateFormControl = new FormControl(0)

  public hbMDnsIsSaving = false
  public hbMDnsFormControl = new FormControl('')

  public enableMdnsAdvertiseFormControl = new FormControl(false)
  public enableMdnsAdvertiseIsSaving = false

  public hbPortIsInvalid = false
  public hbPortIsSaving = false
  public hbPortFormControl = new FormControl(0)

  public uiPortIsInvalid = false
  public uiPortIsSaving = false
  public uiPortFormControl = new FormControl(0)

  public hbStartPortIsInvalid = false
  public hbStartPortIsSaving = false
  public hbStartPortFormControl = new FormControl(0)

  public hbEndPortIsInvalid = false
  public hbEndPortIsSaving = false
  public hbEndPortFormControl = new FormControl(0)

  public uiHostIsSaving = false
  public uiHostFormControl = new FormControl('')

  public uiProxyHostIsSaving = false
  public uiProxyHostFormControl = new FormControl('')

  public uiAuthIsSaving = false
  public uiAuthFormControl = new UntypedFormControl(true)

  public uiSessionTimeoutIsInvalid = false
  public uiSessionTimeoutIsSaving = false
  public uiSessionTimeoutFormControl = new FormControl(0)

  public uiSslTypeFormControl = new FormControl('off')

  public uiSslKeyIsSaving = false
  public uiSslKeyFormControl = new FormControl('')

  public uiSslCertIsSaving = false
  public uiSslCertFormControl = new FormControl('')

  public uiSslPfxIsSaving = false
  public uiSslPfxFormControl = new FormControl('')

  public uiSslPassphraseIsSaving = false
  public uiSslPassphraseFormControl = new FormControl('')

  public hbPackageIsSaving = false
  public hbPackageFormControl = new FormControl('')

  public uiMetricsIsSaving = false
  public uiMetricsFormControl = new FormControl(true)

  public uiAccDebugIsSaving = false
  public uiAccDebugFormControl = new FormControl(false)

  public uiTempFileIsSaving = false
  public uiTempFileFormControl = new FormControl('')

  public hbLinuxShutdownIsSaving = false
  public hbLinuxShutdownFormControl = new FormControl('')

  public hbLinuxRestartIsSaving = false
  public hbLinuxRestartFormControl = new FormControl('')

  public readonly linkDebug = '<a href="https://github.com/homebridge/homebridge-config-ui-x/wiki/Debug-Common-Values" target="_blank" rel="noopener noreferrer"><i class="fa fa-external-link-alt primary-text"></i></a>'

  public toggleSearch() {
    this.showSearchBar = !this.showSearchBar
    if (this.showSearchBar) {
      // Focus on search input after a short delay
      setTimeout(() => {
        if (this.searchInput && this.searchInput.nativeElement) {
          this.searchInput.nativeElement.focus()
        }
      }, 100)
    } else {
      // Clear search when hiding
      this.clearSearch()
    }
  }

  public clearSearch() {
    this.searchQuery = ''
    this.filterSettings()
  }

  public filterSettings() {
    // Clear all hidden items
    this.hiddenItems = {}

    if (!this.searchQuery) {
      // If no search query, show everything
      return
    }

    const query = this.searchQuery.toLowerCase()
    const itemsContent = this.getItemsContent()

    // Check each item and hide those that don't match
    Object.entries(itemsContent).forEach(([itemId, searchableText]) => {
      const matches = searchableText && searchableText.toLowerCase().includes(query)
      if (!matches) {
        this.hiddenItems[itemId] = true
      }
    })

    // Trigger change detection manually
    this.$cdr.detectChanges()
  }

  public isItemHidden(itemId: string): boolean {
    const isHidden = !!this.hiddenItems[itemId]
    if (this.searchQuery) { // Only log when searching
    }
    return isHidden
  }

  public isSectionVisible(sectionName: string): boolean {
    // If no search query, all sections are visible
    if (!this.searchQuery) {
      return true
    }

    // Define which items belong to which section
    const sectionItems: Record<string, string[]> = {
      general: [
        'setting-name',
        'setting-backup',
        'setting-restore',
        'setting-users',
      ],
      display: [
        'setting-lang',
        'setting-theme',
        'setting-lighting',
        'setting-menu',
        'setting-temp',
        'setting-betas',
        'setting-wallpaper',
      ],
      startup: [
        'setting-debug',
        'setting-insecure',
        'setting-keep',
        'setting-metrics-startup',
        'setting-package-path',
        'setting-linux-restart',
        'setting-env-debug-manual',
        'setting-env-node',
      ],
      network: [
        'setting-interfaces',
        'setting-mdns',
        'setting-port-hb',
        'setting-port-range',
        'setting-port-end',
        'setting-network-host',
        'setting-network-proxy',
        'setting-ui-port-network',
        'setting-mdns-advertise',
      ],
      terminal: [
        'setting-terminal-log-max',
        'setting-terminal-persistence',
        'setting-terminal-buffer',
      ],
      security: [
        'setting-security-auth',
        'setting-security-session',
        'setting-security-https',
        'setting-security-cert',
        'setting-security-pass',
        'setting-security-control',
      ],
      cache: [
        'setting-accessory-debug',
        'setting-reset-accessory-ind',
        'setting-reset-bridge-accessories',
        'setting-reset-accessory-all',
      ],
      reset: [
        'setting-reset-bridge-ind',
        'setting-reset-bridge-all',
      ],
    }

    // Get the items for this section
    const items = sectionItems[sectionName]
    if (!items) {
      return true // If section not defined, show it by default
    }

    // Check if at least one item in the section is visible
    return items.some(itemId => !this.isItemHidden(itemId))
  }

  private getItemsContent(): Record<string, string> {
    // Map each setting item to its translated text
    return {
      // General section
      'setting-name': this.$translate.instant('settings.name'),
      'setting-backup': this.$translate.instant('backup.title_backup'),
      'setting-restore': this.$translate.instant('config.restore.title'),
      'setting-users': this.$translate.instant('menu.tooltip_user_accounts'),

      // Display section
      'setting-lang': this.$translate.instant('settings.display.lang'),
      'setting-theme': this.$translate.instant('settings.display.theme'),
      'setting-lighting': this.$translate.instant('settings.display.lighting_mode'),
      'setting-menu': this.$translate.instant('settings.display.menu_mode'),
      'setting-temp': this.$translate.instant('settings.display.temp_units'),
      'setting-betas': this.$translate.instant('settings.display.show_betas'),
      'setting-wallpaper': this.$translate.instant('settings.display.wallpaper'),

      // Startup section
      'setting-debug': this.$translate.instant('settings.startup.debug'),
      'setting-insecure': this.$translate.instant('settings.startup.insecure'),
      'setting-keep': this.$translate.instant('settings.startup.keep_accessories'),
      'setting-metrics-startup': this.$translate.instant('settings.startup.metrics'),
      'setting-env-debug': this.$translate.instant('settings.startup.env_debug'),
      'setting-env-debug-manual': 'DEBUG',
      'setting-env-node': this.$translate.instant('settings.startup.env_node_options'),
      'setting-log-size': this.$translate.instant('settings.startup.log_length'),
      'setting-log-truncate': this.$translate.instant('settings.startup.truncate_log'),
      'setting-package-path': this.$translate.instant('settings.startup.homebridge_package_path'),

      // Network section
      'setting-mdns': this.$translate.instant('settings.mdns_advertiser'),
      'setting-interfaces': this.$translate.instant('settings.network.title_network_interfaces'),
      'setting-port-hb': this.$translate.instant('settings.network.port_hb'),
      'setting-port-bridge': this.$translate.instant('settings.network.port.bridge'),
      'setting-port-range': this.$translate.instant('settings.network.port.start'),
      'setting-port-end': this.$translate.instant('settings.network.port.end'),
      'setting-network-host': this.$translate.instant('settings.network.host'),
      'setting-network-proxy': this.$translate.instant('settings.network.proxy'),
      'setting-ui-port-network': this.$translate.instant('settings.network.port_ui'),
      'setting-mdns-advertise': this.$translate.instant('settings.network.mdns_advertise'),

      // Security section
      'setting-security-auth': this.$translate.instant('settings.security.auth'),
      'setting-security-session': this.$translate.instant('settings.startup.session'),
      'setting-security-https': this.$translate.instant('settings.security.https'),
      'setting-security-cert': this.$translate.instant('settings.security.cert'),
      'setting-security-pass': this.$translate.instant('settings.security.pass'),
      'setting-security-control': this.$translate.instant('settings.security.ui_control'),
      'setting-ui-port': this.$translate.instant('settings.security.webui_port'),
      'setting-ui-host': this.$translate.instant('settings.security.webui_host'),
      'setting-ui-auth': this.$translate.instant('settings.security.webui_auth'),
      'setting-session-timeout': this.$translate.instant('settings.security.session_timeout'),
      'setting-proxy': this.$translate.instant('settings.security.webui_proxy_host'),
      'setting-ssl': this.$translate.instant('settings.security.ssl_key'),

      // Terminal section
      'setting-terminal-log-max': this.$translate.instant('settings.terminal.log_max'),
      'setting-terminal-persistence': this.$translate.instant('settings.terminal.persistence'),
      'setting-terminal-warning': this.$translate.instant('settings.terminal.hide_warning'),
      'setting-terminal-buffer': this.$translate.instant('settings.terminal.buffer_size'),

      // Reset section
      'setting-reset-accessory-ind': this.$translate.instant('reset.accessory_ind.title'),
      'setting-reset-bridge-accessories': this.$translate.instant('reset.bridge_accessories.title'),
      'setting-reset-accessory-all': this.$translate.instant('reset.accessory_all.title'),
      'setting-reset-bridge-ind': this.$translate.instant('reset.bridge_ind.title'),
      'setting-reset-bridge-all': this.$translate.instant('reset.bridge_all.title'),
      'setting-reset-state': this.$translate.instant('settings.reset.reset_homebridge_state'),
      'setting-unpair': this.$translate.instant('settings.reset.unpair_bridges'),
      'setting-metrics': this.$translate.instant('settings.reset.enable_metrics'),
      'setting-accessory-control': this.$translate.instant('settings.reset.control_panel'),
      'setting-accessory-debug': this.$translate.instant('settings.accessory.debug'),
      'setting-temp-files': this.$translate.instant('settings.reset.temp_files'),
      'setting-linux-shutdown': this.$translate.instant('settings.reset.linux_shutdown'),
      'setting-linux-restart': this.$translate.instant('settings.reset.linux_restart'),

      // Cache section
      'setting-cache-all': this.$translate.instant('settings.cache.title_clear_cache'),
      'setting-cache-bridge': this.$translate.instant('settings.cache.title_clear_bridge_cache'),
      'setting-cache-accessories': this.$translate.instant('settings.cache.title_clear_cached_accessories'),
    }
  }

  public async ngOnInit() {
    this.isHbV2 = this.$settings.env.homebridgeVersion.startsWith('2')

    // Set page title
    const title = this.$translate.instant('menu.label_settings')
    this.$settings.setPageTitle(title)

    await this.initNetworkingOptions()
    await this.initStartupSettings()

    // Some settings might need to be disabled for some users
    // (1) Disable some settings that can modify the URL from being changed from a PWA
    //     This is to stop users from getting stuck if they change the port for example
    if (this.isPwa) {
      this.uiPortFormControl.disable()
      this.uiHostFormControl.disable()
      this.uiProxyHostFormControl.disable()
      this.uiSslTypeFormControl.disable()
      this.uiSslKeyFormControl.disable()
      this.uiSslCertFormControl.disable()
      this.uiSslPfxFormControl.disable()
      this.uiSslPassphraseFormControl.disable()
    }

    this.hbNameFormControl.patchValue(this.$settings.env.homebridgeInstanceName)
    this.hbNameFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: string) => this.hbNameSave(value))

    this.uiLangFormControl.patchValue(this.$settings.env.lang)
    this.uiLangFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: string) => this.uiLangSave(value))

    this.uiThemeFormControl.patchValue(this.$settings.theme)
    this.uiThemeFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: string) => this.uiThemeSave(value))

    this.uiLightFormControl.patchValue(this.$settings.lightingMode)
    this.uiLightFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: 'auto' | 'light' | 'dark') => this.uiLightSave(value))

    this.uiMenuFormControl.patchValue(this.$settings.menuMode)
    this.uiMenuFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: 'default' | 'freeze') => this.uiMenuSave(value))

    this.uiTempFormControl.patchValue(this.$settings.env.temperatureUnits)
    this.uiTempFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: string) => this.uiTempSave(value))

    this.uiAlwaysShowBetasFormControl.patchValue(this.$settings.env.plugins?.alwaysShowBetas || false)
    this.uiAlwaysShowBetasFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: boolean) => this.uiAlwaysShowBetasSave(value))

    this.uiTerminalPersistenceFormControl.patchValue(this.$settings.env.terminal?.persistence)
    this.uiTerminalPersistenceFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: boolean) => this.uiTerminalPersistenceSave(value))

    this.uiTerminalHideWarningFormControl.patchValue(this.$settings.env.terminal?.hideWarning)
    this.uiTerminalHideWarningFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: boolean) => this.uiTerminalHideWarningSave(value))

    this.uiTerminalBufferSizeFormControl.patchValue(this.$settings.env.terminal?.bufferSize)
    this.uiTerminalBufferSizeFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: number) => this.uiTerminalBufferSizeSave(value))

    this.hbLogSizeFormControl.patchValue(this.$settings.env.log?.maxSize)
    this.hbLogSizeFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: number) => this.hbLogSizeSave(value))

    this.hbLogTruncateFormControl.patchValue(this.$settings.env.log?.truncateSize)
    this.hbLogTruncateFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: number) => this.hbLogTruncateSave(value))

    this.uiPortFormControl.patchValue(this.$settings.env.port)
    this.uiPortFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: number) => this.uiPortSave(value))

    this.uiAuthFormControl.patchValue(this.$settings.formAuth)
    this.uiAuthFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: boolean) => this.uiAuthSave(value))

    this.uiSessionTimeoutFormControl.patchValue(this.$settings.sessionTimeout)
    this.uiSessionTimeoutFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: number) => this.uiSessionTimeoutSave(value))

    this.uiSslKeyFormControl.patchValue(this.$settings.env.ssl?.key || '')
    this.uiSslKeyFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: string) => this.uiSslKeySave(value))

    this.uiSslCertFormControl.patchValue(this.$settings.env.ssl?.cert || '')
    this.uiSslCertFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: string) => this.uiSslCertSave(value))

    this.uiSslPfxFormControl.patchValue(this.$settings.env.ssl?.pfx || '')
    this.uiSslPfxFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: string) => this.uiSslPfxSave(value))

    this.uiSslPassphraseFormControl.patchValue(this.$settings.env.ssl?.passphrase || '')
    this.uiSslPassphraseFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: string) => this.uiSslPassphraseSave(value))

    this.uiSslTypeFormControl.patchValue(this.uiSslKeyFormControl.value || this.uiSslCertFormControl.value
      ? 'keycert'
      : (this.uiSslPfxFormControl.value || this.uiSslPassphraseFormControl.value) ? 'pfx' : 'off')
    this.uiSslTypeFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: string) => this.uiSslTypeSave(value))

    this.uiHostFormControl.patchValue(this.$settings.host || '')
    this.uiHostFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: string) => this.uiHostSave(value))

    this.uiProxyHostFormControl.patchValue(this.$settings.proxyHost || '')
    this.uiProxyHostFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: string) => this.uiProxyHostSave(value))

    this.hbPackageFormControl.patchValue(this.$settings.env.homebridgePackagePath || '')
    this.hbPackageFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: string) => this.hbPackageSave(value))

    this.uiMetricsFormControl.patchValue(!this.$settings.env.disableServerMetricsMonitoring)
    this.uiMetricsFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: boolean) => this.uiMetricsSave(value))

    this.enableMdnsAdvertiseFormControl.patchValue(this.$settings.env.enableMdnsAdvertise || false)
    this.enableMdnsAdvertiseFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: boolean) => this.enableMdnsAdvertiseSave(value))

    this.uiAccDebugFormControl.patchValue(this.$settings.env.accessoryControl?.debug)
    this.uiAccDebugFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: boolean) => this.uiAccDebugSave(value))

    this.uiTempFileFormControl.patchValue(this.$settings.env.temp)
    this.uiTempFileFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: string) => this.uiTempFileSave(value))

    this.hbLinuxShutdownFormControl.patchValue(this.$settings.env.linux?.shutdown)
    this.hbLinuxShutdownFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: string) => this.hbLinuxShutdownSave(value))

    this.hbLinuxRestartFormControl.patchValue(this.$settings.env.linux?.restart)
    this.hbLinuxRestartFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: string) => this.hbLinuxRestartSave(value))

    this.loading = false
  }

  public openBackupModal() {
    this.$modal.open(BackupComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  public openConfigBackup() {
    // Go to /config?action=restore
    void this.$router.navigate(['/config'], { queryParams: { action: 'restore' } })
  }

  public openWallpaperModal() {
    this.$modal.open(WallpaperComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  public resetHomebridgeState() {
    this.$modal.open(ResetAllBridgesComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  public unpairAccessory() {
    this.$modal.open(ResetIndividualBridgesComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  public removeAllCachedAccessories() {
    this.$modal.open(RemoveAllAccessoriesComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  public async accessoryUiControl() {
    try {
      const ref = this.$modal.open(AccessoryControlListsComponent, {
        size: 'lg',
        backdrop: 'static',
      })

      ref.componentInstance.existingBlacklist = this.$settings.env.accessoryControl?.instanceBlacklist || []

      await ref.result
      this.showRestartToast()
    } catch (error) {
      if (error !== 'Dismiss') {
        console.error(error)
        this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      }
    }
  }

  public removeSingleCachedAccessories() {
    this.$modal.open(RemoveIndividualAccessoriesComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  public removeBridgeAccessories() {
    this.$modal.open(RemoveBridgeAccessoriesComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  public async selectNetworkInterfaces() {
    const ref = this.$modal.open(SelectNetworkInterfacesComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.adaptersAvailable = this.adaptersAvailable
    ref.componentInstance.adaptersSelected = this.adaptersSelected

    try {
      const adapters: string[] = await ref.result
      this.buildBridgeNetworkAdapterList(adapters)
      await firstValueFrom(this.$api.put('/server/network-interfaces/bridge', { adapters }))
      this.showRestartToast()
    } catch (error) {
      if (error !== 'Dismiss') {
        console.error(error)
        this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      }
    }
  }

  public toggleSection(section: string) {
    this.showFields[section] = !this.showFields[section]
  }

  private async initStartupSettings() {
    try {
      const startupSettingsData = await firstValueFrom(this.$api.get('/platform-tools/hb-service/homebridge-startup-settings'))

      this.hbDebugFormControl.patchValue(startupSettingsData.HOMEBRIDGE_DEBUG)
      this.hbDebugFormControl.valueChanges
        .pipe(debounceTime(750))
        .subscribe((value: boolean) => this.hbDebugSave(value))

      this.hbInsecureFormControl.patchValue(startupSettingsData.HOMEBRIDGE_INSECURE)
      this.hbInsecureFormControl.valueChanges
        .pipe(debounceTime(750))
        .subscribe((value: boolean) => this.hbInsecureSave(value))

      this.hbKeepFormControl.patchValue(startupSettingsData.HOMEBRIDGE_KEEP_ORPHANS)
      this.hbKeepFormControl.valueChanges
        .pipe(debounceTime(750))
        .subscribe((value: boolean) => this.hbKeepSave(value))

      this.hbEnvDebugFormControl.patchValue(startupSettingsData.ENV_DEBUG)
      this.hbEnvDebugFormControl.valueChanges
        .pipe(debounceTime(1500))
        .subscribe((value: string) => this.hbEnvDebugSave(value))

      this.hbEnvNodeFormControl.patchValue(startupSettingsData.ENV_NODE_OPTIONS)
      this.hbEnvNodeFormControl.valueChanges
        .pipe(debounceTime(1500))
        .subscribe((value: string) => this.hbEnvNodeSave(value))
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  private async initNetworkingOptions() {
    try {
      await this.getNetworkSettings()
      const onLinux = (
        this.$settings.env.runningInLinux
        || this.$settings.env.runningInDocker
        || this.$settings.env.runningInSynologyPackage
        || this.$settings.env.runningInPackageMode
      )
      if (onLinux) {
        this.showAvahiMdnsOption = true
        this.showResolvedMdnsOption = true
      }
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  private async getNetworkSettings() {
    return Promise.all([
      firstValueFrom(this.$api.get('/server/network-interfaces/system')),
      firstValueFrom(this.$api.get('/server/network-interfaces/bridge')),
      firstValueFrom(this.$api.get('/server/mdns-advertiser')),
      firstValueFrom(this.$api.get('/server/port')),
      firstValueFrom(this.$api.get('/server/ports')),
    ]).then(([system, adapters, mdnsAdvertiser, port, ports]: [NetworkAdapterAvailable[], string[], { advertiser: string }, { port: number }, { start?: number, end?: number }]) => {
      this.adaptersAvailable = system
      this.buildBridgeNetworkAdapterList(adapters)

      this.hbMDnsFormControl.patchValue(mdnsAdvertiser.advertiser)
      this.hbMDnsFormControl.valueChanges
        .pipe(debounceTime(750))
        .subscribe((value: string) => this.hbMDnsSave(value))

      this.hbPortFormControl.patchValue(port.port)
      this.hbPortFormControl.valueChanges
        .pipe(debounceTime(1500))
        .subscribe((port: number) => this.hbPortSave(port))

      this.hbStartPortFormControl.patchValue(ports.start)
      this.hbStartPortFormControl.valueChanges
        .pipe(debounceTime(1500))
        .subscribe((port: number) => this.hbStartPortSave(port))

      this.hbEndPortFormControl.patchValue(ports.end)
      this.hbEndPortFormControl.valueChanges
        .pipe(debounceTime(1500))
        .subscribe((port: number) => this.hbEndPortSave(port))
    })
  }

  private async saveUiSettingChange(key: string, value: any) {
    // Save the new property to the config file
    try {
      await firstValueFrom(this.$api.put('/config-editor/ui', { key, value }))
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  private async hbNameSave(value: string) {
    // https://github.com/homebridge/HAP-NodeJS/blob/ee41309fd9eac383cdcace39f4f6f6a3d54396f3/src/lib/util/checkName.ts#L12
    if (!value || !(/^[\p{L}\p{N}][\p{L}\p{N} ']*[\p{L}\p{N}]$/u).test(value)) {
      this.hbNameIsInvalid = true
      return
    }

    try {
      this.hbNameIsSaving = true
      await firstValueFrom(this.$api.put('/server/name', { name: value }))
      this.$settings.setEnvItem('homebridgeInstanceName', value)
      this.hbNameIsInvalid = false
      setTimeout(() => {
        this.hbNameIsSaving = false
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbNameIsSaving = false
    }
  }

  private async uiLangSave(value: string) {
    try {
      this.uiLangIsSaving = true
      this.$settings.setLang(value)
      await this.saveUiSettingChange('lang', value)
      setTimeout(() => {
        this.uiLangIsSaving = false
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiLangIsSaving = false
    }
  }

  private async uiThemeSave(value: string) {
    try {
      this.uiThemeIsSaving = true
      this.$settings.setTheme(value)
      await this.saveUiSettingChange('theme', value)
      setTimeout(() => {
        this.uiThemeIsSaving = false
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiThemeIsSaving = false
    }
  }

  private async uiLightSave(value: 'auto' | 'light' | 'dark') {
    try {
      this.uiLightIsSaving = true
      this.$settings.setLightingMode(value, 'user')
      await this.saveUiSettingChange('lightingMode', value)
      setTimeout(() => {
        this.uiLightIsSaving = false
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiLightIsSaving = false
    }
  }

  private async uiMenuSave(value: 'default' | 'freeze') {
    try {
      this.uiMenuIsSaving = true
      this.$settings.setMenuMode(value)
      await this.saveUiSettingChange('menuMode', value)
      window.location.reload()
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiMenuIsSaving = false
    }
  }

  private async uiTempSave(value: string) {
    try {
      this.uiTempIsSaving = true
      this.$settings.setEnvItem('temperatureUnits', value)
      await this.saveUiSettingChange('tempUnits', value)
      setTimeout(() => {
        this.uiTempIsSaving = false
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiTempIsSaving = false
    }
  }

  private async uiAlwaysShowBetasSave(value: boolean) {
    try {
      this.uiAlwaysShowBetasIsSaving = true
      this.$settings.setEnvItem('plugins.alwaysShowBetas', value)
      await this.saveUiSettingChange('plugins.alwaysShowBetas', value)
      setTimeout(() => {
        this.uiAlwaysShowBetasIsSaving = false
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiAlwaysShowBetasIsSaving = false
    }
  }

  private async uiTerminalPersistenceSave(value: boolean) {
    // If turning off persistence and there's an active session, show confirmation
    if (!value && this.$terminal.hasActiveSession()) {
      const ref = this.$modal.open(ConfirmComponent, {
        size: 'lg',
        backdrop: 'static',
      })

      ref.componentInstance.title = this.$translate.instant('settings.terminal.persistence_confirm_title')
      ref.componentInstance.message = this.$translate.instant('settings.terminal.persistence_confirm_message')
      ref.componentInstance.message2 = this.$translate.instant('common.phrases.are_you_sure')
      ref.componentInstance.confirmButtonLabel = this.$translate.instant('form.button_continue')
      ref.componentInstance.confirmButtonClass = 'btn-primary'
      ref.componentInstance.faIconClass = 'fas fa-exclamation-triangle text-warning'

      try {
        // An error will throw if the user cancels the modal
        await ref.result
      } catch {
        // User cancelled, revert the form control value
        this.uiTerminalPersistenceFormControl.patchValue(true, { emitEvent: false })
        return
      }
    }

    try {
      this.uiTerminalPersistenceIsSaving = true

      // If persistence is being turned off, clean up any existing session completely
      if (!value) {
        this.$terminal.destroyPersistentSession()
      }

      this.$settings.setEnvItem('terminal.persistence', value)
      await this.saveUiSettingChange('terminal.persistence', value)
      setTimeout(() => {
        this.uiTerminalPersistenceIsSaving = false
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiTerminalPersistenceIsSaving = false
    }
  }

  private async uiTerminalHideWarningSave(value: boolean) {
    try {
      this.uiTerminalHideWarningIsSaving = true
      this.$settings.setEnvItem('terminal.hideWarning', value)
      await this.saveUiSettingChange('terminal.hideWarning', value)
      setTimeout(() => {
        this.uiTerminalHideWarningIsSaving = false
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiTerminalHideWarningIsSaving = false
    }
  }

  private async uiTerminalBufferSizeSave(value: number) {
    if (value && (typeof value !== 'number' || value < 0 || Number.isInteger(value) === false)) {
      this.uiTerminalBufferSizeIsInvalid = true
      return
    }

    try {
      this.uiTerminalBufferSizeIsSaving = true
      this.$settings.setEnvItem('terminal.bufferSize', value)
      await this.saveUiSettingChange('terminal.bufferSize', value)
      this.uiTerminalBufferSizeIsInvalid = false
      setTimeout(() => {
        this.uiTerminalBufferSizeIsSaving = false
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiTerminalBufferSizeIsSaving = false
    }
  }

  private async hbDebugSave(value: boolean) {
    try {
      this.hbDebugIsSaving = true
      await firstValueFrom(this.$api.put('/platform-tools/hb-service/homebridge-startup-settings', {
        HOMEBRIDGE_DEBUG: value,
        HOMEBRIDGE_KEEP_ORPHANS: this.hbKeepFormControl.value,
        HOMEBRIDGE_INSECURE: this.hbInsecureFormControl.value,
        ENV_DEBUG: this.hbEnvDebugFormControl.value,
        ENV_NODE_OPTIONS: this.hbEnvNodeFormControl.value,
      }))
      setTimeout(() => {
        this.hbDebugIsSaving = false
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
          next: () => this.showRestartToast(),
          error: (error) => {
            console.error(error)
            this.showRestartToast()
          },
        })
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbDebugIsSaving = false
    }
  }

  private async hbInsecureSave(value: boolean) {
    try {
      this.hbInsecureIsSaving = true
      await firstValueFrom(this.$api.put('/platform-tools/hb-service/homebridge-startup-settings', {
        HOMEBRIDGE_DEBUG: this.hbDebugFormControl.value,
        HOMEBRIDGE_KEEP_ORPHANS: this.hbKeepFormControl.value,
        HOMEBRIDGE_INSECURE: value,
        ENV_DEBUG: this.hbEnvDebugFormControl.value,
        ENV_NODE_OPTIONS: this.hbEnvNodeFormControl.value,
      }))
      setTimeout(() => {
        this.hbInsecureIsSaving = false
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
          next: () => this.showRestartToast(),
          error: (error) => {
            console.error(error)
            this.showRestartToast()
          },
        })
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbInsecureIsSaving = false
    }
  }

  private async hbKeepSave(value: boolean) {
    try {
      this.hbKeepIsSaving = true
      await firstValueFrom(this.$api.put('/platform-tools/hb-service/homebridge-startup-settings', {
        HOMEBRIDGE_DEBUG: this.hbDebugFormControl.value,
        HOMEBRIDGE_KEEP_ORPHANS: value,
        HOMEBRIDGE_INSECURE: this.hbInsecureFormControl.value,
        ENV_DEBUG: this.hbEnvDebugFormControl.value,
        ENV_NODE_OPTIONS: this.hbEnvNodeFormControl.value,
      }))
      this.$settings.setKeepOrphans(value)
      setTimeout(() => {
        this.hbKeepIsSaving = false
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
          next: () => this.showRestartToast(),
          error: (error) => {
            console.error(error)
            this.showRestartToast()
          },
        })
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbKeepIsSaving = false
    }
  }

  private async hbEnvDebugSave(value: string) {
    try {
      this.hbEnvDebugIsSaving = true
      await firstValueFrom(this.$api.put('/platform-tools/hb-service/homebridge-startup-settings', {
        HOMEBRIDGE_DEBUG: this.hbDebugFormControl.value,
        HOMEBRIDGE_KEEP_ORPHANS: this.hbKeepFormControl.value,
        HOMEBRIDGE_INSECURE: this.hbInsecureFormControl.value,
        ENV_DEBUG: value,
        ENV_NODE_OPTIONS: this.hbEnvNodeFormControl.value,
      }))
      setTimeout(() => {
        this.hbEnvDebugIsSaving = false
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
          next: () => this.showRestartToast(),
          error: (error) => {
            console.error(error)
            this.showRestartToast()
          },
        })
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbEnvDebugIsSaving = false
    }
  }

  private async hbEnvNodeSave(value: string) {
    try {
      this.hbEnvNodeIsSaving = true
      await firstValueFrom(this.$api.put('/platform-tools/hb-service/homebridge-startup-settings', {
        HOMEBRIDGE_DEBUG: this.hbDebugFormControl.value,
        HOMEBRIDGE_KEEP_ORPHANS: this.hbKeepFormControl.value,
        HOMEBRIDGE_INSECURE: this.hbInsecureFormControl.value,
        ENV_DEBUG: this.hbEnvDebugFormControl.value,
        ENV_NODE_OPTIONS: value,
      }))
      setTimeout(() => {
        this.hbEnvNodeIsSaving = false
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
          next: () => this.showRestartToast(),
          error: (error) => {
            console.error(error)
            this.showRestartToast()
          },
        })
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbEnvNodeIsSaving = false
    }
  }

  private async hbLogSizeSave(value: number) {
    if (value && (typeof value !== 'number' || value < -1 || Number.isInteger(value) === false)) {
      this.hbLogSizeIsInvalid = true
      return
    }

    try {
      this.hbLogSizeIsSaving = true
      this.$settings.setEnvItem('log.maxSize', value)
      if (!value || value === -1) {
        // If the value is -1, we set the log.maxSize to undefined
        // This will remove the setting from the config file
        await this.saveUiSettingChange('log.truncateSize', null)
        this.hbLogTruncateIsInvalid = false
      }
      await this.saveUiSettingChange('log.maxSize', value)
      this.hbLogSizeIsInvalid = false
      setTimeout(() => {
        this.hbLogSizeIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbLogSizeIsSaving = false
    }
  }

  private async hbLogTruncateSave(value: number) {
    if (value && (typeof value !== 'number' || value < 0 || Number.isInteger(value) === false)) {
      this.hbLogTruncateIsInvalid = true
      return
    }

    try {
      this.hbLogTruncateIsSaving = true
      this.$settings.setEnvItem('log.truncateSize', value)
      await this.saveUiSettingChange('log.truncateSize', value)
      this.hbLogTruncateIsInvalid = false
      setTimeout(() => {
        this.hbLogTruncateIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbLogTruncateIsSaving = false
    }
  }

  private async hbMDnsSave(value: string) {
    try {
      this.hbMDnsIsSaving = true
      await firstValueFrom(this.$api.put('/server/mdns-advertiser', { advertiser: value }))
      setTimeout(() => {
        this.hbMDnsIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbMDnsIsSaving = false
    }
  }

  private async hbPortSave(value: number) {
    if (value === this.uiPortFormControl.value) {
      this.hbPortIsInvalid = true
      return
    }

    try {
      this.hbPortIsSaving = true
      await firstValueFrom(this.$api.put('/server/port', { port: value }))
      this.hbPortIsInvalid = false
      setTimeout(() => {
        this.hbPortIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbPortIsSaving = false
    }
  }

  private async hbStartPortSave(value: number) {
    try {
      this.hbStartPortIsSaving = true
      await firstValueFrom(this.$api.put('/server/ports', { start: value, end: this.hbEndPortFormControl.value }))
      this.hbStartPortIsInvalid = false
      setTimeout(() => {
        this.hbStartPortIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbStartPortIsSaving = false
    }
  }

  private async hbEndPortSave(value: number) {
    try {
      this.hbEndPortIsSaving = true
      await firstValueFrom(this.$api.put('/server/ports', { start: this.hbStartPortFormControl.value, end: value }))
      this.hbEndPortIsInvalid = false
      setTimeout(() => {
        this.hbEndPortIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbEndPortIsSaving = false
    }
  }

  private async uiPortSave(value: number) {
    if (!value || typeof value !== 'number' || value < 1025 || value > 65533 || Number.isInteger(value) === false || value === this.hbPortFormControl.value) {
      this.uiPortIsInvalid = true
      return
    }

    try {
      this.uiPortIsSaving = true
      this.$settings.setEnvItem('port', value)
      await this.saveUiSettingChange('port', value)
      this.uiPortIsInvalid = false
      setTimeout(() => {
        this.uiPortIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiPortIsSaving = false
    }
  }

  private async uiAuthSave(value: boolean) {
    try {
      this.uiAuthIsSaving = true
      this.$settings.setItem('formAuth', value)
      await this.saveUiSettingChange('auth', value ? 'form' : 'none')
      this.$notification.formAuthEnabled.next(value)
      setTimeout(() => {
        this.uiAuthIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiAuthIsSaving = false
    }
  }

  private async uiSessionTimeoutSave(value: number) {
    if (value && (typeof value !== 'number' || value < 600 || value > 86400000 || Number.isInteger(value) === false)) {
      this.uiSessionTimeoutIsInvalid = true
      return
    }

    try {
      this.uiSessionTimeoutIsSaving = true
      this.$settings.setItem('sessionTimeout', value)
      await this.saveUiSettingChange('sessionTimeout', value)
      this.uiSessionTimeoutIsInvalid = false
      setTimeout(() => {
        this.uiSessionTimeoutIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiSessionTimeoutIsSaving = false
    }
  }

  private async uiSslKeySave(value: string) {
    try {
      this.uiSslKeyIsSaving = true
      this.$settings.setEnvItem('ssl.key', value)
      await this.saveUiSettingChange('ssl.key', value)
      setTimeout(() => {
        this.uiSslKeyIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiSslKeyIsSaving = false
    }
  }

  private async uiSslCertSave(value: string) {
    try {
      this.uiSslCertIsSaving = true
      this.$settings.setEnvItem('ssl.cert', value)
      await this.saveUiSettingChange('ssl.cert', value)
      setTimeout(() => {
        this.uiSslCertIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiSslCertIsSaving = false
    }
  }

  private async uiSslPfxSave(value: string) {
    try {
      this.uiSslPfxIsSaving = true
      this.$settings.setEnvItem('ssl.pfx', value)
      await this.saveUiSettingChange('ssl.pfx', value)
      setTimeout(() => {
        this.uiSslPfxIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiSslPfxIsSaving = false
    }
  }

  private async uiSslPassphraseSave(value: string) {
    try {
      this.uiSslPassphraseIsSaving = true
      this.$settings.setEnvItem('ssl.passphrase', value)
      await this.saveUiSettingChange('ssl.passphrase', value)
      setTimeout(() => {
        this.uiSslPassphraseIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiSslPassphraseIsSaving = false
    }
  }

  private async uiSslTypeSave(value: string) {
    switch (value) {
      case 'keycert':
        this.uiSslPfxFormControl.patchValue('', { emitEvent: false })
        this.uiSslPassphraseFormControl.patchValue('', { emitEvent: false })
        this.$settings.setEnvItem('ssl.pfx', '')
        this.$settings.setEnvItem('ssl.passphrase', '')
        break
      case 'pfx':
        this.uiSslKeyFormControl.patchValue('', { emitEvent: false })
        this.uiSslCertFormControl.patchValue('', { emitEvent: false })
        this.$settings.setEnvItem('ssl.key', '')
        this.$settings.setEnvItem('ssl.cert', '')
        break
      default:
        this.uiSslKeyFormControl.patchValue('', { emitEvent: false })
        this.uiSslCertFormControl.patchValue('', { emitEvent: false })
        this.uiSslPfxFormControl.patchValue('', { emitEvent: false })
        this.uiSslPassphraseFormControl.patchValue('', { emitEvent: false })
        this.$settings.setEnvItem('ssl.key', '')
        this.$settings.setEnvItem('ssl.cert', '')
        this.$settings.setEnvItem('ssl.pfx', '')
        this.$settings.setEnvItem('ssl.passphrase', '')
        await this.saveUiSettingChange('ssl', '')
        this.showRestartToast()
    }
  }

  private async uiHostSave(value: string) {
    try {
      this.uiHostIsSaving = true
      this.$settings.setItem('host', value)
      await this.saveUiSettingChange('host', value)
      setTimeout(() => {
        this.uiHostIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiHostIsSaving = false
    }
  }

  private async uiProxyHostSave(value: string) {
    try {
      this.uiProxyHostIsSaving = true
      this.$settings.setItem('proxyHost', value)
      await this.saveUiSettingChange('proxyHost', value)
      setTimeout(() => {
        this.uiProxyHostIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiProxyHostIsSaving = false
    }
  }

  private async hbPackageSave(value: string) {
    try {
      this.hbPackageIsSaving = true
      this.$settings.setEnvItem('homebridgePackagePath', value)
      await this.saveUiSettingChange('homebridgePackagePath', value)
      setTimeout(() => {
        this.hbPackageIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbPackageIsSaving = false
    }
  }

  private async uiMetricsSave(value: boolean) {
    try {
      this.uiMetricsIsSaving = true
      this.$settings.setEnvItem('disableServerMetricsMonitoring', !value)
      await this.saveUiSettingChange('disableServerMetricsMonitoring', !value)
      setTimeout(() => {
        this.uiMetricsIsSaving = false
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
          next: () => this.showRestartToast(),
          error: (error) => {
            console.error(error)
            this.showRestartToast()
          },
        })
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiMetricsIsSaving = false
    }
  }

  private async enableMdnsAdvertiseSave(value: boolean) {
    try {
      this.enableMdnsAdvertiseIsSaving = true
      this.$settings.setEnvItem('enableMdnsAdvertise', value)
      await this.saveUiSettingChange('enableMdnsAdvertise', value)
      setTimeout(() => {
        this.enableMdnsAdvertiseIsSaving = false
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
          next: () => this.showRestartToast(),
          error: (error) => {
            console.error(error)
            this.showRestartToast()
          },
        })
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  private async uiAccDebugSave(value: boolean) {
    try {
      this.uiAccDebugIsSaving = true
      this.$settings.setEnvItem('accessoryControl.debug', value)
      await this.saveUiSettingChange('accessoryControl.debug', value)
      setTimeout(() => {
        this.uiAccDebugIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiAccDebugIsSaving = false
    }
  }

  private async uiTempFileSave(value: string) {
    try {
      this.uiTempFileIsSaving = true
      this.$settings.setEnvItem('temp', value)
      await this.saveUiSettingChange('temp', value)
      setTimeout(() => {
        this.uiTempFileIsSaving = false
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
          next: () => this.showRestartToast(),
          error: (error) => {
            console.error(error)
            this.showRestartToast()
          },
        })
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiTempFileIsSaving = false
    }
  }

  private async hbLinuxShutdownSave(value: string) {
    try {
      this.hbLinuxShutdownIsSaving = true
      this.$settings.setEnvItem('linux.shutdown', value)
      await this.saveUiSettingChange('linux.shutdown', value)
      setTimeout(() => {
        this.hbLinuxShutdownIsSaving = false
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
          next: () => this.showRestartToast(),
          error: (error) => {
            console.error(error)
            this.showRestartToast()
          },
        })
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbLinuxShutdownIsSaving = false
    }
  }

  private async hbLinuxRestartSave(value: string) {
    try {
      this.hbLinuxRestartIsSaving = true
      this.$settings.setEnvItem('linux.restart', value)
      await this.saveUiSettingChange('linux.restart', value)
      setTimeout(() => {
        this.hbLinuxRestartIsSaving = false
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
          next: () => this.showRestartToast(),
          error: (error) => {
            console.error(error)
            this.showRestartToast()
          },
        })
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbLinuxRestartIsSaving = false
    }
  }

  private buildBridgeNetworkAdapterList(adapters: string[]) {
    if (!adapters.length) {
      this.adaptersSelected = []
      return
    }

    this.adaptersSelected = adapters.map((interfaceName) => {
      const i = this.adaptersAvailable.find(x => x.iface === interfaceName)
      if (i) {
        return {
          iface: i.iface,
          selected: true,
          missing: false,
          ip4: i.ip4,
          ip6: i.ip6,
        }
      } else {
        return {
          iface: interfaceName,
          selected: true,
          missing: true,
        }
      }
    })
  }

  private showRestartToast() {
    if (!this.restartToastIsShown) {
      this.restartToastIsShown = true
      const ref = this.$toastr.info(
        this.$translate.instant('settings.changes.saved'),
        this.$translate.instant('menu.hbrestart.title'),
        {
          timeOut: 0,
          tapToDismiss: true,
          disableTimeOut: true,
          positionClass: 'toast-bottom-right',
          enableHtml: true,
        },
      )

      if (ref && ref.onTap) {
        ref.onTap.subscribe(() => {
          void this.$router.navigate(['/restart'])
        })
      }
    }
  }
}
