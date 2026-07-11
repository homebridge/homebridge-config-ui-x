import type { NetworkAdapterAvailable, NetworkAdapterSelected } from '@/app/modules/settings/settings.interfaces'
import type { WritableSignal } from '@angular/core'

import { TitleCasePipe } from '@angular/common'
import { afterNextRender, ChangeDetectionStrategy, ChangeDetectorRef, Component, createEnvironmentInjector, DestroyRef, ElementRef, EnvironmentInjector, inject, OnInit, runInInjectionContext, signal, viewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule, UntypedFormControl } from '@angular/forms'
import { Router, RouterLink } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { isStandalonePWA } from 'is-standalone-pwa'
import { ToastrService } from 'ngx-toastr'
import { debounceTime } from 'rxjs/operators'

import { ApiService } from '@/app/core/communication/api.service'
import { NotificationService } from '@/app/core/communication/notification.service'
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { SpinnerComponent } from '@/app/core/components/spinner/spinner.component'
import { ACCESSORY_CONTROL_LISTS_MODAL_DATA, CONFIRM_MODAL_DATA, NETWORK_INTERFACES_MODAL_DATA, REMOVE_INDIVIDUAL_ACCESSORIES_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { RE_CRON_FIELD, RE_HAP_NAME_PATTERN, RE_WHITESPACE_SINGLE } from '@/app/core/regex.constants'
import { SettingsService } from '@/app/core/ui/settings.service'
import { HttpErrorService } from '@/app/core/utilities/http-error.service'
import { TerminalService } from '@/app/core/utilities/terminal.service'
import { AccessoryControlListsComponent } from '@/app/modules/settings/accessory-control-lists/accessory-control-lists.component'
import { BackupComponent } from '@/app/modules/settings/backup/backup.component'
import { PortOverviewModalComponent } from '@/app/modules/settings/port-overview-modal/port-overview-modal.component'
import { RemoveAllAccessoriesComponent } from '@/app/modules/settings/remove-all-accessories/remove-all-accessories.component'
import { RemoveBridgeAccessoriesComponent } from '@/app/modules/settings/remove-bridge-accessories/remove-bridge-accessories.component'
import { RemoveIndividualAccessoriesComponent } from '@/app/modules/settings/remove-individual-accessories/remove-individual-accessories.component'
import { ResetAllBridgesComponent } from '@/app/modules/settings/reset-all-bridges/reset-all-bridges.component'
import { ResetIndividualBridgesComponent } from '@/app/modules/settings/reset-individual-bridges/reset-individual-bridges.component'
import { SelectNetworkInterfacesComponent } from '@/app/modules/settings/select-network-interfaces/select-network-interfaces.component'
import { SslSettingsModalComponent } from '@/app/modules/settings/ssl-settings-modal/ssl-settings-modal.component'
import { WallpaperComponent } from '@/app/modules/settings/wallpaper/wallpaper.component'

@Component({
  selector: 'app-settings',
  imports: [
    RouterLink,
    FormsModule,
    ReactiveFormsModule,
    TitleCasePipe,
    TranslatePipe,
    SpinnerComponent,
  ],
  standalone: true,
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements OnInit {
  // Injected dependencies
  private destroyRef = inject(DestroyRef)
  private injector = inject(EnvironmentInjector)
  private cdr = inject(ChangeDetectorRef)
  private $api = inject(ApiService)
  private $errors = inject(HttpErrorService)
  private $modal = inject(NgbModal)
  private $notification = inject(NotificationService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $terminal = inject(TerminalService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  readonly searchInput = viewChild<ElementRef>('searchInput')

  // Signals
  public readonly showSearchBar = signal(false)
  public readonly searchQuery = signal('')
  public readonly isThemeTransitioning = signal(false)

  public readonly showFields = signal({
    general: true,
    display: true,
    startup: true,
    network: true,
    hap: true,
    matter: true,
    security: true,
    terminal: true,
    reset: true,
    cache: true,
  })

  // Track which items are hidden by search
  public readonly hiddenItems = signal<Record<string, boolean>>({})

  // Define which items belong to which section
  private sectionItems: Record<string, string[]> = {
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
      'setting-terminal-font-size',
      'setting-terminal-font-weight',
      'setting-terminal-lighting-mode',
      'setting-wallpaper',
    ],
    startup: [
      'setting-debug',
      'setting-keep',
      'setting-insecure',
      'setting-security-control',
      'setting-scheduled-restart',
      'setting-metrics-startup',
      'setting-package-path',
      'setting-linux-shutdown',
      'setting-linux-restart',
      'setting-linux-temp',
      'setting-env-debug-manual',
      'setting-env-node',
      'setting-docker-startup',
    ],
    network: [
      'setting-interfaces',
      'setting-mdns',
      'setting-mdns-advertise',
      'setting-port-hb',
      'setting-port-range',
      'setting-network-host',
      'setting-network-proxy',
      'setting-ui-port-network',
      'setting-port-overview',
    ],
    hap: [
      'setting-hap-enabled',
    ],
    matter: [
      'setting-matter-enabled',
      'setting-matter-port',
      'setting-matter-port-range',
    ],
    terminal: [
      'setting-terminal-log-max',
      'setting-terminal-log-truncate',
      'setting-terminal-persistence',
      'setting-terminal-warning',
      'setting-terminal-buffer',
    ],
    security: [
      'setting-security-auth',
      'setting-session-inactivity',
      'setting-security-session',
      'setting-security-https',
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

  public readonly loading = signal(true)
  public debugFieldDesc = 'settings.startup.debug_desc_v1' // default, may be changed in ngOnInit
  public readonly showAvahiMdnsOption = signal(false)
  public readonly showResolvedMdnsOption = signal(false)
  public readonly adaptersAvailable = signal<NetworkAdapterAvailable[]>([])
  public readonly adaptersSelected = signal<NetworkAdapterSelected[]>([])
  public runningInDocker = this.$settings.env.runningInDocker
  public runningOnRaspberryPi = this.$settings.env.runningOnRaspberryPi
  public runningOnRaspbianImage = this.$settings.env.runningOnRaspbianImage
  public platform = this.$settings.env.platform
  public enableTerminalAccess = this.$settings.env.enableTerminalAccess
  public isMatterSupported = this.$settings.isFeatureEnabled('matterSupport')
  // When false (older Homebridge), at least one of HAP/Matter must stay enabled.
  public allowDisableAllProtocols = this.$settings.isFeatureEnabled('disableAllProtocols')
  // When true (Homebridge >= 2.0.3-beta.22), disabling Matter is non-destructive
  // (matter.enabled=false, storage kept) rather than a teardown.
  public allowMatterDisableInPlace = this.$settings.isFeatureEnabled('matterDisableInPlace')
  // When true (Homebridge >= 2.0.3-beta.26), HAP config uses the nested object
  // form and both HAP and Matter expose an externalsOnly toggle.
  public isProtocolExternalsOnlyEnabled = this.$settings.isFeatureEnabled('protocolExternalsOnly')
  public isPwa = Boolean(isStandalonePWA())

  public readonly hbNameIsInvalid = signal(false)
  public readonly hbNameIsSaving = signal(false)
  public hbNameFormControl = new FormControl('')

  public readonly uiLangIsSaving = signal(false)
  public uiLangFormControl = new FormControl('')

  public readonly uiThemeIsSaving = signal(false)
  public uiThemeFormControl = new FormControl('')

  public readonly uiLightIsSaving = signal(false)
  public uiLightFormControl = new FormControl('')

  public readonly uiMenuIsSaving = signal(false)
  public uiMenuFormControl = new FormControl('')

  public readonly uiTempIsSaving = signal(false)
  public uiTempFormControl = new FormControl('')

  public readonly uiTerminalPersistenceIsSaving = signal(false)
  public uiTerminalPersistenceFormControl = new FormControl(false)

  public readonly uiTerminalHideWarningIsSaving = signal(false)
  public uiTerminalHideWarningFormControl = new FormControl(false)

  public readonly uiTerminalBufferSizeIsSaving = signal(false)
  public readonly uiTerminalBufferSizeIsInvalid = signal(false)
  public uiTerminalBufferSizeFormControl = new FormControl(globalThis.terminal.bufferSize)

  public readonly uiTerminalFontSizeIsSaving = signal(false)
  public uiTerminalFontSizeFormControl = new FormControl(13)
  public fontSizes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]

  public readonly uiTerminalFontWeightIsSaving = signal(false)
  public uiTerminalFontWeightFormControl = new FormControl('400')
  public fontWeights = ['100', '200', '300', '400', '500', '600', '700', '800', '900', 'bold', 'normal']

  public readonly uiTerminalLightingModeIsSaving = signal(false)
  public uiTerminalLightingModeFormControl = new FormControl('dark')

  // Only allow light theme when in light mode
  public get terminalThemes(): string[] {
    return this.$settings.actualLightingMode === 'light' ? ['light', 'dark'] : ['dark']
  }

  // Disable terminal theme dropdown when in dark mode (since terminal must be dark)
  public get isTerminalLightingModeDisabled(): boolean {
    return this.$settings.actualLightingMode === 'dark'
  }

  public readonly hbDebugIsSaving = signal(false)
  public hbDebugFormControl = new FormControl(false)

  public readonly hbInsecureIsSaving = signal(false)
  public hbInsecureFormControl = new FormControl(false)

  public readonly hbKeepIsSaving = signal(false)
  public hbKeepFormControl = new FormControl(false)

  public readonly hbEnvDebugIsSaving = signal(false)
  public hbEnvDebugFormControl = new FormControl('')

  public readonly hbEnvNodeIsSaving = signal(false)
  public hbEnvNodeFormControl = new FormControl('')

  public readonly hbLogSizeIsInvalid = signal(false)
  public readonly hbLogSizeIsSaving = signal(false)
  public hbLogSizeFormControl = new FormControl(-1)

  public readonly hbLogTruncateIsInvalid = signal(false)
  public readonly hbLogTruncateIsSaving = signal(false)
  public hbLogTruncateFormControl = new FormControl(0)

  public readonly hbMDnsIsSaving = signal(false)
  public hbMDnsFormControl = new FormControl('')

  public enableMdnsAdvertiseFormControl = new FormControl(false)
  public readonly enableMdnsAdvertiseIsSaving = signal(false)

  public readonly hbPortIsInvalid = signal(false)
  public readonly hbPortIsSaving = signal(false)
  public hbPortFormControl = new FormControl(0)

  public readonly uiPortIsInvalid = signal(false)
  public readonly uiPortIsSaving = signal(false)
  public uiPortFormControl = new FormControl(0)

  public readonly hbStartPortIsInvalid = signal(false)
  public readonly hbStartPortIsSaving = signal(false)
  public hbStartPortFormControl = new FormControl(0)

  public readonly hbEndPortIsInvalid = signal(false)
  public readonly hbEndPortIsSaving = signal(false)
  public hbEndPortFormControl = new FormControl(0)

  public readonly uiHostIsSaving = signal(false)
  public uiHostFormControl = new FormControl('')

  public readonly uiProxyHostIsSaving = signal(false)
  public uiProxyHostFormControl = new FormControl('')

  public readonly uiAuthIsSaving = signal(false)
  public uiAuthFormControl = new UntypedFormControl(true)

  public readonly uiSessionTimeoutDaysIsInvalid = signal(false)
  public readonly uiSessionTimeoutHoursIsInvalid = signal(false)
  public readonly uiSessionTimeoutMinutesIsInvalid = signal(false)
  public readonly uiSessionTimeoutIsSaving = signal(false)
  public uiSessionTimeoutDaysFormControl = new FormControl(0)
  public uiSessionTimeoutHoursFormControl = new FormControl(8)
  public uiSessionTimeoutMinutesFormControl = new FormControl(0)

  public readonly uiSessionTimeoutInactivityBasedIsSaving = signal(false)
  public uiSessionTimeoutInactivityBasedFormControl = new FormControl(false)

  public uiSslTypeFormControl = new FormControl('off')

  public readonly uiSslKeyIsSaving = signal(false)
  public uiSslKeyFormControl = new FormControl('')

  public readonly uiSslCertIsSaving = signal(false)
  public uiSslCertFormControl = new FormControl('')

  public readonly uiSslPfxIsSaving = signal(false)
  public uiSslPfxFormControl = new FormControl('')

  public readonly uiSslPassphraseIsSaving = signal(false)
  public uiSslPassphraseFormControl = new FormControl('')

  public readonly uiSslSelfSignedHostnamesIsSaving = signal(false)
  public uiSslSelfSignedHostnamesFormControl = new FormControl('')

  public readonly hbPackageIsSaving = signal(false)
  public hbPackageFormControl = new FormControl('')

  public readonly uiMetricsIsSaving = signal(false)
  public uiMetricsFormControl = new FormControl(true)

  public readonly uiAccDebugIsSaving = signal(false)
  public uiAccDebugFormControl = new FormControl(false)

  public readonly uiTempFileIsSaving = signal(false)
  public uiTempFileFormControl = new FormControl('')

  public readonly hbLinuxShutdownIsSaving = signal(false)
  public hbLinuxShutdownFormControl = new FormControl('')

  public readonly hbLinuxRestartIsSaving = signal(false)
  public hbLinuxRestartFormControl = new FormControl('')

  public readonly scheduledRestartCronIsInvalid = signal(false)
  public readonly scheduledRestartCronIsSaving = signal(false)
  public scheduledRestartCronFormControl = new FormControl('')

  public readonly hapEnabledIsSaving = signal(false)
  public hapEnabledFormControl = new FormControl(true)
  // externalsOnly is only meaningful when HAP is disabled. The toggle is
  // hidden in the UI when hapEnabledFormControl.value === true.
  public readonly hapExternalsOnlyIsSaving = signal(false)
  public hapExternalsOnlyFormControl = new FormControl(false)

  public readonly matterEnabledIsSaving = signal(false)
  public matterEnabledFormControl = new FormControl(false)
  public readonly matterExternalsOnlyIsSaving = signal(false)
  public matterExternalsOnlyFormControl = new FormControl(false)

  public readonly matterPortIsInvalid = signal(false)
  public readonly matterPortIsSaving = signal(false)
  public matterPortFormControl = new FormControl(0)

  public readonly matterStartPortIsInvalid = signal(false)
  public readonly matterStartPortIsSaving = signal(false)
  public matterStartPortFormControl = new FormControl(0)

  public readonly matterEndPortIsInvalid = signal(false)
  public readonly matterEndPortIsSaving = signal(false)
  public matterEndPortFormControl = new FormControl(0)

  // Other properties
  // Cache for Matter config values (in-memory only, for restoring after accidental disable)
  private matterConfigCache: { port?: number } = {}
  public readonly linkDebug = '<a href="https://github.com/homebridge/homebridge-config-ui-x/wiki/Debug-Common-Values" target="_blank" rel="noopener noreferrer"><i class="fas fa-up-right-from-square primary-text"></i></a>'
  public readonly linkRaspbianSsl = '<a href="https://github.com/homebridge/homebridge-raspbian-image/wiki/SSL-HTTPS-Access" target="_blank" rel="noopener noreferrer"><i class="fas fa-up-right-from-square primary-text"></i></a>'
  public readonly linkCron = '<a href="https://crontab.guru/" target="_blank" rel="noopener noreferrer"><i class="fas fa-up-right-from-square primary-text"></i></a>'

  public toggleSearch(): void {
    this.showSearchBar.update(current => !current)
    if (this.showSearchBar()) {
      // Focus on search input after next render
      runInInjectionContext(this.injector, () => {
        afterNextRender(() => {
          const input = this.searchInput()
          if (input) {
            input.nativeElement.focus()
          }
        })
      })
    } else {
      // Clear search when hiding
      this.clearSearch()
    }
  }

  public onSearchChange(value: string): void {
    this.searchQuery.set(value)
    this.filterSettings()
  }

  public clearSearch(): void {
    this.searchQuery.set('')
    this.filterSettings()
  }

  public filterSettings(): void {
    // Clear all hidden items
    this.hiddenItems.set({})

    if (!this.searchQuery()) {
      // If no search query, show everything
      return
    }

    const query = this.searchQuery().toLowerCase()
    const itemsContent = this.getItemsContent()
    const sectionContent = this.getSectionContent()

    // Determine which sections match by title or description
    const matchedSections = new Set<string>()
    for (const [sectionName, searchableText] of Object.entries(sectionContent)) {
      if (searchableText.toLowerCase().includes(query)) {
        matchedSections.add(sectionName)
      }
    }

    // Check each item and hide those that don't match
    const newHiddenItems: Record<string, boolean> = {}
    Object.entries(itemsContent).forEach(([itemId, searchableText]) => {
      // If this item belongs to a section that matched, keep it visible
      const belongsToMatchedSection = Object.entries(this.sectionItems).some(
        ([sectionName, items]) => matchedSections.has(sectionName) && items.includes(itemId),
      )
      if (belongsToMatchedSection) {
        return
      }

      const matches = searchableText && searchableText.toLowerCase().includes(query)
      if (!matches) {
        newHiddenItems[itemId] = true
      }
    })
    // Also hide items whose non-search rendering conditions are false,
    // so isSectionVisible correctly excludes items not in the DOM.
    for (const itemId of this.getUnavailableItems()) {
      newHiddenItems[itemId] = true
    }

    this.hiddenItems.set(newHiddenItems)
  }

  /**
   * Returns item IDs that are not currently rendered due to non-search
   * template conditions (platform checks, dependent toggles, etc.).
   */
  private getUnavailableItems(): string[] {
    const unavailable: string[] = []

    if (this.platform !== 'linux') {
      unavailable.push('setting-linux-shutdown', 'setting-linux-restart', 'setting-linux-temp')
    } else if (!this.runningOnRaspberryPi) {
      unavailable.push('setting-linux-temp')
    }

    if (!this.runningInDocker) {
      unavailable.push('setting-docker-startup')
    }

    if (!this.matterEnabledFormControl.value) {
      unavailable.push('setting-matter-port', 'setting-matter-port-range')
    }

    if (!(this.hbLogSizeFormControl.value! > 0)) {
      unavailable.push('setting-terminal-log-truncate')
    }

    if (!this.enableTerminalAccess) {
      unavailable.push('setting-terminal-persistence', 'setting-terminal-warning', 'setting-terminal-buffer')
    } else if (this.uiTerminalPersistenceFormControl.value) {
      unavailable.push('setting-terminal-warning')
    } else {
      unavailable.push('setting-terminal-buffer')
    }

    if (!this.uiAuthFormControl.value) {
      unavailable.push('setting-session-inactivity', 'setting-security-session')
    }

    return unavailable
  }

  public isItemHidden(itemId: string): boolean {
    const isHidden = !!this.hiddenItems()[itemId]
    if (this.searchQuery()) { // Only log when searching
    }
    return isHidden
  }

  public isSectionVisible(sectionName: string): boolean {
    // If no search query, all sections are visible
    if (!this.searchQuery()) {
      return true
    }

    // Get the items for this section
    const items = this.sectionItems[sectionName]
    if (!items) {
      return true // If section not defined, show it by default
    }

    // Check if at least one item in the section is visible
    return items.some(itemId => !this.isItemHidden(itemId))
  }

  private getSectionContent(): Record<string, string> {
    return {
      general: this.$translate.instant('settings.general.title_general'),
      display: this.$translate.instant('settings.general.title_display'),
      startup: this.$translate.instant('settings.title_startup_options'),
      network: this.$translate.instant('settings.network.title_network'),
      matter: `${this.$translate.instant('settings.matter.title')} ${this.$translate.instant('settings.matter.desc')}`,
      terminal: this.$translate.instant('settings.network.title_terminal'),
      security: this.$translate.instant('settings.network.title_security'),
      cache: `${this.$translate.instant('menu.label_accessories')} ${this.$translate.instant('settings.cache.desc')}`,
      reset: `${this.$translate.instant('reset.bridges.title')} ${this.$translate.instant('reset.bridges.desc')}`,
    }
  }

  private getItemsContent(): Record<string, string> {
    // Map each setting item to its translated text (must match sectionItems)
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
      'setting-terminal-font-size': this.$translate.instant('settings.terminal.theme'),
      'setting-terminal-font-weight': this.$translate.instant('settings.terminal.theme'),
      'setting-terminal-lighting-mode': this.$translate.instant('settings.terminal.theme'),
      'setting-wallpaper': this.$translate.instant('settings.display.wallpaper'),

      // Startup section
      'setting-debug': this.$translate.instant('settings.startup.debug'),
      'setting-keep': this.$translate.instant('settings.startup.keep_accessories'),
      'setting-insecure': this.$translate.instant('settings.startup.insecure'),
      'setting-security-control': this.$translate.instant('settings.security.ui_control'),
      'setting-scheduled-restart': this.$translate.instant('settings.startup.scheduled_restart'),
      'setting-metrics-startup': this.$translate.instant('settings.startup.metrics'),
      'setting-package-path': this.$translate.instant('settings.network.hb_package'),
      'setting-linux-shutdown': this.$translate.instant('settings.linux.shutdown'),
      'setting-linux-restart': this.$translate.instant('settings.linux.restart'),
      'setting-linux-temp': this.$translate.instant('settings.linux.temp'),
      'setting-env-debug-manual': 'DEBUG',
      'setting-env-node': 'NODE OPTIONS',
      'setting-docker-startup': this.$translate.instant('menu.docker.startup_script'),

      // Network section
      'setting-interfaces': this.$translate.instant('settings.network.title_network_interfaces'),
      'setting-mdns': this.$translate.instant('settings.mdns_advertiser'),
      'setting-mdns-advertise': this.$translate.instant('settings.network.mdns_advertise'),
      'setting-port-hb': this.$translate.instant('settings.network.port_hb'),
      'setting-port-range': this.$translate.instant('settings.network.port_range'),
      'setting-network-host': this.$translate.instant('settings.network.host'),
      'setting-network-proxy': this.$translate.instant('settings.network.proxy'),
      'setting-ui-port-network': this.$translate.instant('settings.network.port_ui'),
      'setting-port-overview': this.$translate.instant('settings.ports.title'),

      // Matter section
      'setting-matter-enabled': `${this.$translate.instant('common.labels.enabled')} ${this.$translate.instant('settings.matter.enabled_desc')}`,
      'setting-matter-port': `${this.$translate.instant('settings.matter.port')} ${this.$translate.instant('settings.matter.port_desc')}`,
      'setting-matter-port-range': `${this.$translate.instant('settings.network.port_range')} ${this.$translate.instant('settings.matter.port_range_desc')}`,

      // Terminal section
      'setting-terminal-log-max': this.$translate.instant('settings.terminal.log_max'),
      'setting-terminal-log-truncate': this.$translate.instant('settings.terminal.log_truncate'),
      'setting-terminal-persistence': this.$translate.instant('settings.terminal.persistence'),
      'setting-terminal-warning': this.$translate.instant('settings.terminal.warning'),
      'setting-terminal-buffer': this.$translate.instant('settings.terminal.buffer_size'),

      // Security section
      'setting-security-auth': this.$translate.instant('settings.security.auth'),
      'setting-session-inactivity': this.$translate.instant('settings.startup.session_inactivity_based'),
      'setting-security-session': this.$translate.instant('settings.startup.session'),
      'setting-security-https': this.$translate.instant('settings.security.https_enable'),

      // Cache section
      'setting-accessory-debug': this.$translate.instant('settings.accessory.debug'),
      'setting-reset-accessory-ind': this.$translate.instant('reset.accessory_ind.title'),
      'setting-reset-bridge-accessories': this.$translate.instant('reset.bridge_accessories.title'),
      'setting-reset-accessory-all': this.$translate.instant('reset.accessory_all.title'),

      // Reset section
      'setting-reset-bridge-ind': this.$translate.instant('reset.bridge_ind.title'),
      'setting-reset-bridge-all': this.$translate.instant('reset.bridge_all.title'),
    }
  }

  public ngOnInit(): void {
    void this.initialize()
  }

  private async initialize(): Promise<void> {
    // Set page title
    const title = this.$translate.instant('menu.label_settings')
    this.$settings.setPageTitle(title)

    if (this.$settings.isFeatureEnabled('childBridgeDebugMode')) {
      this.debugFieldDesc = 'settings.startup.debug_desc_v2'
    }

    await this.initNetworkingOptions()
    await this.initStartupSettings()

    // (2) Disable some settings that can modify the URL from being changed from a PWA
    //     This is to stop users from getting stuck if they change the host or port
    if (this.isPwa) {
      this.uiPortFormControl.disable()
      this.uiHostFormControl.disable()
      this.uiProxyHostFormControl.disable()
      this.uiSslTypeFormControl.disable()
      this.uiSslKeyFormControl.disable()
      this.uiSslCertFormControl.disable()
      this.uiSslPfxFormControl.disable()
      this.uiSslPassphraseFormControl.disable()
      this.uiSslSelfSignedHostnamesFormControl.disable()
    }

    // (2) Disable the SSL select box if running in raspbian image (externally managed)
    if (this.runningOnRaspbianImage) {
      this.uiSslTypeFormControl.disable()
    }

    this.hbNameFormControl.patchValue(this.$settings.env.homebridgeInstanceName, { emitEvent: false })
    this.hbNameFormControl.valueChanges
      .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.hbNameSave(value!))

    this.uiLangFormControl.patchValue(this.$settings.env.lang, { emitEvent: false })
    this.uiLangFormControl.valueChanges
      .pipe(debounceTime(750), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiLangSave(value!))

    this.uiThemeFormControl.patchValue(this.$settings.theme, { emitEvent: false })
    this.uiThemeFormControl.valueChanges
      .pipe(debounceTime(750), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiThemeSave(value!))

    this.uiLightFormControl.patchValue(this.$settings.lightingMode, { emitEvent: false })
    this.uiLightFormControl.valueChanges
      .pipe(debounceTime(750), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiLightSave(value as 'auto' | 'light' | 'dark'))

    this.uiMenuFormControl.patchValue(this.$settings.menuMode, { emitEvent: false })
    this.uiMenuFormControl.valueChanges
      .pipe(debounceTime(750), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiMenuSave(value as 'default' | 'freeze'))

    this.uiTempFormControl.patchValue(this.$settings.env.temperatureUnits, { emitEvent: false })
    this.uiTempFormControl.valueChanges
      .pipe(debounceTime(750), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiTempSave(value!))

    this.uiTerminalPersistenceFormControl.patchValue(this.$settings.env.terminal?.persistence ?? null, { emitEvent: false })
    this.uiTerminalPersistenceFormControl.valueChanges
      .pipe(debounceTime(750), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiTerminalPersistenceSave(value!))

    this.uiTerminalHideWarningFormControl.patchValue(this.$settings.env.terminal?.hideWarning ?? null, { emitEvent: false })
    this.uiTerminalHideWarningFormControl.valueChanges
      .pipe(debounceTime(750), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiTerminalHideWarningSave(value!))

    this.uiTerminalBufferSizeFormControl.patchValue(this.$settings.env.terminal?.bufferSize ?? null, { emitEvent: false })
    this.uiTerminalBufferSizeFormControl.valueChanges
      .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiTerminalBufferSizeSave(value!))

    // Validate and set terminal fontSize
    const savedFontSize = this.$settings.env.terminal?.fontSize
    if (savedFontSize !== undefined && (savedFontSize < 10 || savedFontSize > 20)) {
      // Invalid value, delete it from config
      void this.deleteInvalidSetting('terminal.fontSize')
      this.uiTerminalFontSizeFormControl.patchValue(13, { emitEvent: false })
    } else {
      this.uiTerminalFontSizeFormControl.patchValue(savedFontSize || 13, { emitEvent: false })
    }
    this.uiTerminalFontSizeFormControl.valueChanges
      .pipe(debounceTime(750), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiTerminalFontSizeSave(value!))

    // Validate and set terminal fontWeight
    const savedFontWeight = this.$settings.env.terminal?.fontWeight
    if (savedFontWeight !== undefined && !this.fontWeights.includes(String(savedFontWeight))) {
      // Invalid value, delete it from config
      void this.deleteInvalidSetting('terminal.fontWeight')
      this.uiTerminalFontWeightFormControl.patchValue('400', { emitEvent: false })
    } else {
      this.uiTerminalFontWeightFormControl.patchValue(savedFontWeight || '400', { emitEvent: false })
    }
    this.uiTerminalFontWeightFormControl.valueChanges
      .pipe(debounceTime(750), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiTerminalFontWeightSave(value!))

    // Terminal lighting mode - default to dark, but allow light if main theme is light
    const savedTerminalTheme = this.$settings.env.terminal?.lightingMode
    const defaultTheme = this.$settings.actualLightingMode === 'light' ? (savedTerminalTheme || 'dark') : 'dark'
    this.uiTerminalLightingModeFormControl.patchValue(defaultTheme, { emitEvent: false })
    if (this.isTerminalLightingModeDisabled) {
      this.uiTerminalLightingModeFormControl.disable({ emitEvent: false })
    }
    this.uiTerminalLightingModeFormControl.valueChanges
      .pipe(debounceTime(750), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiTerminalLightingModeSave(value!))

    this.hbLogSizeFormControl.patchValue(this.$settings.env.log?.maxSize ?? null, { emitEvent: false })
    this.hbLogSizeFormControl.valueChanges
      .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.hbLogSizeSave(value!))

    this.hbLogTruncateFormControl.patchValue(this.$settings.env.log?.truncateSize ?? null, { emitEvent: false })
    this.hbLogTruncateFormControl.valueChanges
      .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.hbLogTruncateSave(value!))

    this.uiPortFormControl.patchValue(this.$settings.env.port, { emitEvent: false })
    this.uiPortFormControl.valueChanges
      .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiPortSave(value!))

    this.uiAuthFormControl.patchValue(this.$settings.formAuth, { emitEvent: false })
    this.uiAuthFormControl.valueChanges
      .pipe(debounceTime(750), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiAuthSave(value!))

    // Convert seconds to days, hours, minutes
    const sessionTimeoutSeconds = this.$settings.sessionTimeout
    const days = Math.floor(sessionTimeoutSeconds / 86400)
    const hours = Math.floor((sessionTimeoutSeconds % 86400) / 3600)
    const minutes = Math.floor((sessionTimeoutSeconds % 3600) / 60)

    this.uiSessionTimeoutDaysFormControl.patchValue(days, { emitEvent: false })
    this.uiSessionTimeoutHoursFormControl.patchValue(hours, { emitEvent: false })
    this.uiSessionTimeoutMinutesFormControl.patchValue(minutes, { emitEvent: false })

    this.uiSessionTimeoutDaysFormControl.valueChanges
      .pipe(debounceTime(750), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.uiSessionTimeoutSaveFromFields())

    this.uiSessionTimeoutHoursFormControl.valueChanges
      .pipe(debounceTime(750), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.uiSessionTimeoutSaveFromFields())

    this.uiSessionTimeoutMinutesFormControl.valueChanges
      .pipe(debounceTime(750), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.uiSessionTimeoutSaveFromFields())

    this.uiSessionTimeoutInactivityBasedFormControl.patchValue(this.$settings.sessionTimeoutInactivityBased || false, { emitEvent: false })
    this.uiSessionTimeoutInactivityBasedFormControl.valueChanges
      .pipe(debounceTime(750), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiSessionTimeoutInactivityBasedSave(value!))

    this.uiSslKeyFormControl.patchValue(this.$settings.env.ssl?.key || '', { emitEvent: false })
    this.uiSslKeyFormControl.valueChanges
      .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiSslKeySave(value!))

    this.uiSslCertFormControl.patchValue(this.$settings.env.ssl?.cert || '', { emitEvent: false })
    this.uiSslCertFormControl.valueChanges
      .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiSslCertSave(value!))

    this.uiSslPfxFormControl.patchValue(this.$settings.env.ssl?.pfx || '', { emitEvent: false })
    this.uiSslPfxFormControl.valueChanges
      .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiSslPfxSave(value!))

    this.uiSslPassphraseFormControl.patchValue('', { emitEvent: false })
    this.uiSslPassphraseFormControl.valueChanges
      .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiSslPassphraseSave(value!))

    this.uiSslSelfSignedHostnamesFormControl.patchValue(
      this.$settings.env.ssl?.selfSignedHostnames?.join(', ') || 'localhost, 127.0.0.1',
      { emitEvent: false },
    )
    this.uiSslSelfSignedHostnamesFormControl.valueChanges
      .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiSslSelfSignedHostnamesSave(value!))

    this.uiSslTypeFormControl.patchValue(
      this.$settings.env.ssl?.selfSigned
        ? 'selfsigned'
        : this.$settings.env.ssl?.key || this.$settings.env.ssl?.cert
          ? 'keycert'
          : (this.$settings.env.ssl?.pfx || this.$settings.env.ssl?.hasPassphrase) ? 'pfx' : 'off',
      { emitEvent: false },
    )
    this.uiSslTypeFormControl.valueChanges
      .pipe(debounceTime(750), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiSslTypeSave(value!))

    this.uiHostFormControl.patchValue(this.$settings.host || '', { emitEvent: false })
    this.uiHostFormControl.valueChanges
      .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiHostSave(value!))

    this.uiProxyHostFormControl.patchValue(this.$settings.proxyHost || '', { emitEvent: false })
    this.uiProxyHostFormControl.valueChanges
      .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiProxyHostSave(value!))

    this.hbPackageFormControl.patchValue(this.$settings.env.homebridgePackagePath || '', { emitEvent: false })
    this.hbPackageFormControl.valueChanges
      .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.hbPackageSave(value!))

    this.uiMetricsFormControl.patchValue(!this.$settings.env.disableServerMetricsMonitoring, { emitEvent: false })
    this.uiMetricsFormControl.valueChanges
      .pipe(debounceTime(750), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiMetricsSave(value!))

    this.enableMdnsAdvertiseFormControl.patchValue(this.$settings.env.enableMdnsAdvertise || false, { emitEvent: false })
    this.enableMdnsAdvertiseFormControl.valueChanges
      .pipe(debounceTime(750), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.enableMdnsAdvertiseSave(value!))

    this.uiAccDebugFormControl.patchValue(this.$settings.env.accessoryControl?.debug ?? null, { emitEvent: false })
    this.uiAccDebugFormControl.valueChanges
      .pipe(debounceTime(750), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiAccDebugSave(value!))

    this.uiTempFileFormControl.patchValue(this.$settings.env.temp ?? null, { emitEvent: false })
    this.uiTempFileFormControl.valueChanges
      .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.uiTempFileSave(value!))

    this.hbLinuxShutdownFormControl.patchValue(this.$settings.env.linux?.shutdown ?? null, { emitEvent: false })
    this.hbLinuxShutdownFormControl.valueChanges
      .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.hbLinuxShutdownSave(value!))

    this.hbLinuxRestartFormControl.patchValue(this.$settings.env.linux?.restart ?? null, { emitEvent: false })
    this.hbLinuxRestartFormControl.valueChanges
      .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.hbLinuxRestartSave(value!))

    this.scheduledRestartCronFormControl.patchValue(this.$settings.env.scheduledRestartCron || '', { emitEvent: false })
    this.scheduledRestartCronFormControl.valueChanges
      .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.scheduledRestartCronSave(value!))

    await this.initMatterSettings()
    await this.initHapSettings()

    this.loading.set(false)
  }

  public openBackupModal(): void {
    this.$modal.open(BackupComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  public openConfigBackup(): void {
    // Go to /config?action=restore
    void this.$router.navigate(['/config'], {
      queryParams: { action: 'restore' },
    })
  }

  public openWallpaperModal(): void {
    this.$modal.open(WallpaperComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  public async openSslModal(): Promise<void> {
    const modalRef = this.$modal.open(SslSettingsModalComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    try {
      // Modal returns the selected mode when saved successfully
      const newSslType = await modalRef.result
      // Update form control without emitting events, then manually trigger change detection
      this.uiSslTypeFormControl.patchValue(newSslType, { emitEvent: false })
      this.cdr.detectChanges()
      // Show the global restart toast since SSL changes require a restart
      this.$settings.showRestartToast()
    } catch (error: any) {
      // Modal was dismissed without saving, do nothing
    }
  }

  public resetHomebridgeState(): void {
    this.$modal.open(ResetAllBridgesComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  public unpairAccessory(): void {
    this.$modal.open(ResetIndividualBridgesComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  public removeAllCachedAccessories(): void {
    this.$modal.open(RemoveAllAccessoriesComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  public async accessoryUiControl(): Promise<void> {
    try {
      const injector = createEnvironmentInjector([{
        provide: ACCESSORY_CONTROL_LISTS_MODAL_DATA,
        useValue: {
          existingBlacklist: this.$settings.env.accessoryControl?.instanceBlacklist || [],
        },
      }], this.injector)

      const ref = this.$modal.open(AccessoryControlListsComponent, {
        size: 'lg',
        backdrop: 'static',
        injector,
      })

      await ref.result
      this.$settings.showRestartToast()
    } catch (error: any) {
      if (error !== 'Dismiss') {
        console.error(error)
        this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      }
    }
  }

  public removeSingleCachedAccessories(): void {
    const injector = createEnvironmentInjector([{
      provide: REMOVE_INDIVIDUAL_ACCESSORIES_MODAL_DATA,
      useValue: {
        selectedBridge: '',
      },
    }], this.injector)

    this.$modal.open(RemoveIndividualAccessoriesComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })
  }

  public removeBridgeAccessories(): void {
    this.$modal.open(RemoveBridgeAccessoriesComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  public async selectNetworkInterfaces(): Promise<void> {
    const injector = createEnvironmentInjector([{
      provide: NETWORK_INTERFACES_MODAL_DATA,
      useValue: {
        adaptersAvailable: this.adaptersAvailable(),
        adaptersSelected: this.adaptersSelected(),
      },
    }], this.injector)

    const ref = this.$modal.open(SelectNetworkInterfacesComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      const adapters: string[] = await ref.result
      this.buildBridgeNetworkAdapterList(adapters)
      await this.$api.put('/server/network-interfaces/bridge', { adapters })
      this.$settings.showRestartToast()
    } catch (error: any) {
      if (error !== 'Dismiss') {
        console.error(error)
        this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      }
    }
  }

  public openPortOverview(): void {
    this.$modal.open(PortOverviewModalComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  public toggleSection(section: keyof ReturnType<typeof this.showFields>): void {
    this.showFields.set({ ...this.showFields(), [section]: !this.showFields()[section] })
  }

  private async initStartupSettings(): Promise<void> {
    try {
      const startupSettingsData = await this.$api.get('/platform-tools/hb-service/homebridge-startup-settings')

      this.hbDebugFormControl.patchValue(startupSettingsData.HOMEBRIDGE_DEBUG, { emitEvent: false })
      this.hbDebugFormControl.valueChanges
        .pipe(debounceTime(750), takeUntilDestroyed(this.destroyRef))
        .subscribe(value => this.hbDebugSave(value!))

      this.hbInsecureFormControl.patchValue(startupSettingsData.HOMEBRIDGE_INSECURE, { emitEvent: false })
      this.hbInsecureFormControl.valueChanges
        .pipe(debounceTime(750), takeUntilDestroyed(this.destroyRef))
        .subscribe(value => this.hbInsecureSave(value!))

      this.hbKeepFormControl.patchValue(startupSettingsData.HOMEBRIDGE_KEEP_ORPHANS, { emitEvent: false })
      this.hbKeepFormControl.valueChanges
        .pipe(debounceTime(750), takeUntilDestroyed(this.destroyRef))
        .subscribe(value => this.hbKeepSave(value!))

      this.hbEnvDebugFormControl.patchValue(startupSettingsData.ENV_DEBUG, { emitEvent: false })
      this.hbEnvDebugFormControl.valueChanges
        .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
        .subscribe(value => this.hbEnvDebugSave(value!))

      this.hbEnvNodeFormControl.patchValue(startupSettingsData.ENV_NODE_OPTIONS, { emitEvent: false })
      this.hbEnvNodeFormControl.valueChanges
        .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
        .subscribe(value => this.hbEnvNodeSave(value!))
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
    }
  }

  private async initNetworkingOptions(): Promise<void> {
    try {
      await this.getNetworkSettings()
      const onLinux = (
        this.$settings.env.runningInLinux
        || this.$settings.env.runningInDocker
        || this.$settings.env.runningInSynologyPackage
        || this.$settings.env.runningInPackageMode
      )
      if (onLinux) {
        this.showAvahiMdnsOption.set(true)
        this.showResolvedMdnsOption.set(true)
      }
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
    }
  }

  private async getNetworkSettings(): Promise<void> {
    const [system, adapters, mdnsAdvertiser, port, ports] = await Promise.all([
      this.$api.get<NetworkAdapterAvailable[]>('/server/network-interfaces/system'),
      this.$api.get<string[]>('/server/network-interfaces/bridge'),
      this.$api.get<{ advertiser: string }>('/server/mdns-advertiser'),
      this.$api.get<{ port: number }>('/server/port'),
      this.$api.get<{ start?: number, end?: number }>('/server/ports'),
    ])

    this.adaptersAvailable.set(system)
    this.buildBridgeNetworkAdapterList(adapters)

    this.hbMDnsFormControl.patchValue(mdnsAdvertiser.advertiser, { emitEvent: false })
    this.hbMDnsFormControl.valueChanges
      .pipe(debounceTime(750), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.hbMDnsSave(value!))

    this.hbPortFormControl.patchValue(port.port, { emitEvent: false })
    this.hbPortFormControl.valueChanges
      .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
      .subscribe(port => this.hbPortSave(port!))

    this.hbStartPortFormControl.patchValue(ports.start ?? null, { emitEvent: false })
    this.hbStartPortFormControl.valueChanges
      .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
      .subscribe(port => this.hbStartPortSave(port!))

    this.hbEndPortFormControl.patchValue(ports.end ?? null, { emitEvent: false })
    this.hbEndPortFormControl.valueChanges
      .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
      .subscribe(port => this.hbEndPortSave(port!))
  }

  // Pending-changes buffer for UI config writes — when several form fields
  // settle around the same time we coalesce their saves into one
  // PATCH /config-editor/ui (one disk write) instead of issuing one PUT per
  // field. The promise returned to each caller resolves when the next flush
  // completes so per-field "isSaving" indicators stay accurate.
  private pendingUiChanges = new Map<string, unknown>()
  private pendingUiFlushTimer: ReturnType<typeof setTimeout> | null = null
  private pendingUiFlush: { promise: Promise<void>, resolve: () => void, reject: (error: any) => void } | null = null
  private static readonly UI_FLUSH_COALESCE_MS = 150

  private async saveUiSettingChange(key: string, value: unknown): Promise<void> {
    try {
      await this.queueUiSettingChange(key, value)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
    }
  }

  private queueUiSettingChange(key: string, value: unknown): Promise<void> {
    this.pendingUiChanges.set(key, value)

    if (!this.pendingUiFlush) {
      let resolve!: () => void
      let reject!: (error: any) => void
      const promise = new Promise<void>((res, rej) => {
        resolve = res
        reject = rej
      })
      this.pendingUiFlush = { promise, resolve, reject }
    }

    if (this.pendingUiFlushTimer) {
      clearTimeout(this.pendingUiFlushTimer)
    }
    this.pendingUiFlushTimer = setTimeout(
      () => void this.flushPendingUiChanges(),
      SettingsComponent.UI_FLUSH_COALESCE_MS,
    )

    return this.pendingUiFlush.promise
  }

  private async flushPendingUiChanges(): Promise<void> {
    if (this.pendingUiFlushTimer) {
      clearTimeout(this.pendingUiFlushTimer)
      this.pendingUiFlushTimer = null
    }
    if (this.pendingUiChanges.size === 0 || !this.pendingUiFlush) {
      return
    }

    const payload = Object.fromEntries(this.pendingUiChanges)
    const flush = this.pendingUiFlush
    this.pendingUiChanges = new Map()
    this.pendingUiFlush = null

    try {
      await this.$api.patch('/config-editor/ui', payload)
      flush.resolve()
    } catch (error) {
      flush.reject(error)
    }
  }

  private async hbNameSave(value: string): Promise<void> {
    if (!value || !RE_HAP_NAME_PATTERN.test(value)) {
      this.hbNameIsInvalid.set(true)
      return
    }

    try {
      this.hbNameIsSaving.set(true)
      await this.$api.put('/server/name', { name: value })
      this.$settings.setEnvItem('homebridgeInstanceName', value)
      this.hbNameIsInvalid.set(false)
      setTimeout(() => {
        this.hbNameIsSaving.set(false)
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.hbNameIsSaving.set(false)
    }
  }

  private async uiLangSave(value: string): Promise<void> {
    try {
      this.uiLangIsSaving.set(true)
      this.$settings.setLang(value)
      await this.saveUiSettingChange('lang', value)
      setTimeout(() => {
        this.uiLangIsSaving.set(false)
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiLangIsSaving.set(false)
    }
  }

  private async uiThemeSave(value: string): Promise<void> {
    try {
      this.uiThemeIsSaving.set(true)

      // Start fade-out animation
      this.isThemeTransitioning.set(true)

      // Wait for fade-out to complete
      await new Promise(resolve => setTimeout(resolve, 250))

      // Change the theme (background will transition)
      this.$settings.setTheme(value)
      await this.saveUiSettingChange('theme', value)

      // Wait for background transition to start, then fade content back in
      await new Promise(resolve => setTimeout(resolve, 100))
      this.isThemeTransitioning.set(false)

      setTimeout(() => {
        this.uiThemeIsSaving.set(false)
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiThemeIsSaving.set(false)
      this.isThemeTransitioning.set(false)
    }
  }

  private async uiLightSave(value: 'auto' | 'light' | 'dark'): Promise<void> {
    try {
      this.uiLightIsSaving.set(true)

      // Start fade-out animation
      this.isThemeTransitioning.set(true)

      // Wait for fade-out to complete
      await new Promise(resolve => setTimeout(resolve, 250))

      // Change the lighting mode (background will transition)
      this.$settings.setLightingMode(value, 'user')
      await this.saveUiSettingChange('lightingMode', value)

      // Wait for background transition to start, then fade content back in
      await new Promise(resolve => setTimeout(resolve, 100))
      this.isThemeTransitioning.set(false)

      setTimeout(() => {
        this.uiLightIsSaving.set(false)
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiLightIsSaving.set(false)
      this.isThemeTransitioning.set(false)
    }
  }

  private async uiMenuSave(value: 'default' | 'freeze'): Promise<void> {
    try {
      this.uiMenuIsSaving.set(true)
      this.$settings.setMenuMode(value)
      await this.saveUiSettingChange('menuMode', value)
      window.location.reload()
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiMenuIsSaving.set(false)
    }
  }

  private async uiTempSave(value: string): Promise<void> {
    try {
      this.uiTempIsSaving.set(true)
      this.$settings.setEnvItem('temperatureUnits', value)
      await this.saveUiSettingChange('tempUnits', value)
      setTimeout(() => {
        this.uiTempIsSaving.set(false)
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiTempIsSaving.set(false)
    }
  }

  private async uiTerminalPersistenceSave(value: boolean): Promise<void> {
    // If turning off persistence and there's an active session, show confirmation
    if (!value && this.$terminal.hasActiveSession()) {
      const injector = createEnvironmentInjector([{
        provide: CONFIRM_MODAL_DATA,
        useValue: {
          title: this.$translate.instant('settings.terminal.persistence_confirm_title'),
          message: this.$translate.instant('settings.terminal.persistence_confirm_message'),
          message2: this.$translate.instant('common.phrases.are_you_sure'),
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
        // An error will throw if the user cancels the modal
        await ref.result
      } catch {
        // User canceled, revert the form control value
        this.uiTerminalPersistenceFormControl.patchValue(true, { emitEvent: false })
        return
      }
    }

    try {
      this.uiTerminalPersistenceIsSaving.set(true)

      // If persistence is being turned off, clean up any existing session completely
      if (!value) {
        void this.$terminal.destroyPersistentSession()
      }

      this.$settings.setEnvItem('terminal.persistence', value)
      await this.saveUiSettingChange('terminal.persistence', value)
      setTimeout(() => {
        this.uiTerminalPersistenceIsSaving.set(false)
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiTerminalPersistenceIsSaving.set(false)
    }
  }

  private async uiTerminalHideWarningSave(value: boolean): Promise<void> {
    try {
      this.uiTerminalHideWarningIsSaving.set(true)
      this.$settings.setEnvItem('terminal.hideWarning', value)
      await this.saveUiSettingChange('terminal.hideWarning', value)
      setTimeout(() => {
        this.uiTerminalHideWarningIsSaving.set(false)
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiTerminalHideWarningIsSaving.set(false)
    }
  }

  private async uiTerminalBufferSizeSave(value: number): Promise<void> {
    if (value && (typeof value !== 'number' || value < 0 || Number.isInteger(value) === false)) {
      this.uiTerminalBufferSizeIsInvalid.set(true)
      return
    }

    try {
      this.uiTerminalBufferSizeIsSaving.set(true)
      this.$settings.setEnvItem('terminal.bufferSize', value)
      await this.saveUiSettingChange('terminal.bufferSize', value)
      this.uiTerminalBufferSizeIsInvalid.set(false)
      setTimeout(() => {
        this.uiTerminalBufferSizeIsSaving.set(false)
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiTerminalBufferSizeIsSaving.set(false)
    }
  }

  private async uiTerminalFontSizeSave(value: number): Promise<void> {
    try {
      this.uiTerminalFontSizeIsSaving.set(true)
      this.$settings.setEnvItem('terminal.fontSize', value)
      await this.saveUiSettingChange('terminal.fontSize', value)
      setTimeout(() => {
        this.uiTerminalFontSizeIsSaving.set(false)
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiTerminalFontSizeIsSaving.set(false)
    }
  }

  private async uiTerminalFontWeightSave(value: string): Promise<void> {
    try {
      this.uiTerminalFontWeightIsSaving.set(true)
      this.$settings.setEnvItem('terminal.fontWeight', value)
      await this.saveUiSettingChange('terminal.fontWeight', value)
      setTimeout(() => {
        this.uiTerminalFontWeightIsSaving.set(false)
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiTerminalFontWeightIsSaving.set(false)
    }
  }

  private async uiTerminalLightingModeSave(value: string): Promise<void> {
    try {
      this.uiTerminalLightingModeIsSaving.set(true)
      this.$settings.setEnvItem('terminal.lightingMode', value)
      await this.saveUiSettingChange('terminal.lightingMode', value)
      setTimeout(() => {
        this.uiTerminalLightingModeIsSaving.set(false)
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiTerminalLightingModeIsSaving.set(false)
    }
  }

  private async hbDebugSave(value: boolean): Promise<void> {
    try {
      this.hbDebugIsSaving.set(true)
      await this.$api.put('/platform-tools/hb-service/homebridge-startup-settings', {
        HOMEBRIDGE_DEBUG: value,
        HOMEBRIDGE_KEEP_ORPHANS: this.hbKeepFormControl.value,
        HOMEBRIDGE_INSECURE: this.hbInsecureFormControl.value,
        ENV_DEBUG: this.hbEnvDebugFormControl.value,
        ENV_NODE_OPTIONS: this.hbEnvNodeFormControl.value,
      })
      setTimeout(() => {
        this.hbDebugIsSaving.set(false)
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {})
          .catch(error => console.error(error))
          .finally(() => this.$settings.showRestartToast())
          .catch((error) => {
            console.error(error)
            this.$settings.showRestartToast()
          })
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.hbDebugIsSaving.set(false)
    }
  }

  private async hbInsecureSave(value: boolean): Promise<void> {
    try {
      this.hbInsecureIsSaving.set(true)
      await this.$api.put('/platform-tools/hb-service/homebridge-startup-settings', {
        HOMEBRIDGE_DEBUG: this.hbDebugFormControl.value,
        HOMEBRIDGE_KEEP_ORPHANS: this.hbKeepFormControl.value,
        HOMEBRIDGE_INSECURE: value,
        ENV_DEBUG: this.hbEnvDebugFormControl.value,
        ENV_NODE_OPTIONS: this.hbEnvNodeFormControl.value,
      })
      setTimeout(() => {
        this.hbInsecureIsSaving.set(false)
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {})
          .catch(error => console.error(error))
          .finally(() => this.$settings.showRestartToast())
          .catch((error) => {
            console.error(error)
            this.$settings.showRestartToast()
          })
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.hbInsecureIsSaving.set(false)
    }
  }

  private async hbKeepSave(value: boolean): Promise<void> {
    try {
      this.hbKeepIsSaving.set(true)
      await this.$api.put('/platform-tools/hb-service/homebridge-startup-settings', {
        HOMEBRIDGE_DEBUG: this.hbDebugFormControl.value,
        HOMEBRIDGE_KEEP_ORPHANS: value,
        HOMEBRIDGE_INSECURE: this.hbInsecureFormControl.value,
        ENV_DEBUG: this.hbEnvDebugFormControl.value,
        ENV_NODE_OPTIONS: this.hbEnvNodeFormControl.value,
      })
      this.$settings.setKeepOrphans(value)
      setTimeout(() => {
        this.hbKeepIsSaving.set(false)
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {})
          .catch(error => console.error(error))
          .finally(() => this.$settings.showRestartToast())
          .catch((error) => {
            console.error(error)
            this.$settings.showRestartToast()
          })
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.hbKeepIsSaving.set(false)
    }
  }

  private async hbEnvDebugSave(value: string): Promise<void> {
    try {
      this.hbEnvDebugIsSaving.set(true)
      await this.$api.put('/platform-tools/hb-service/homebridge-startup-settings', {
        HOMEBRIDGE_DEBUG: this.hbDebugFormControl.value,
        HOMEBRIDGE_KEEP_ORPHANS: this.hbKeepFormControl.value,
        HOMEBRIDGE_INSECURE: this.hbInsecureFormControl.value,
        ENV_DEBUG: value,
        ENV_NODE_OPTIONS: this.hbEnvNodeFormControl.value,
      })
      setTimeout(() => {
        this.hbEnvDebugIsSaving.set(false)
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {})
          .catch(error => console.error(error))
          .finally(() => this.$settings.showRestartToast())
          .catch((error) => {
            console.error(error)
            this.$settings.showRestartToast()
          })
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.hbEnvDebugIsSaving.set(false)
    }
  }

  private async hbEnvNodeSave(value: string): Promise<void> {
    try {
      this.hbEnvNodeIsSaving.set(true)
      await this.$api.put('/platform-tools/hb-service/homebridge-startup-settings', {
        HOMEBRIDGE_DEBUG: this.hbDebugFormControl.value,
        HOMEBRIDGE_KEEP_ORPHANS: this.hbKeepFormControl.value,
        HOMEBRIDGE_INSECURE: this.hbInsecureFormControl.value,
        ENV_DEBUG: this.hbEnvDebugFormControl.value,
        ENV_NODE_OPTIONS: value,
      })
      setTimeout(() => {
        this.hbEnvNodeIsSaving.set(false)
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {})
          .catch(error => console.error(error))
          .finally(() => this.$settings.showRestartToast())
          .catch((error) => {
            console.error(error)
            this.$settings.showRestartToast()
          })
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.hbEnvNodeIsSaving.set(false)
    }
  }

  private async hbLogSizeSave(value: number): Promise<void> {
    if (value && (typeof value !== 'number' || value < -1 || Number.isInteger(value) === false)) {
      this.hbLogSizeIsInvalid.set(true)
      return
    }

    try {
      this.hbLogSizeIsSaving.set(true)
      this.$settings.setEnvItem('log.maxSize', value)
      if (!value || value === -1) {
        // If the value is -1, we set the log.maxSize to undefined
        // This will remove the setting from the config file
        await this.saveUiSettingChange('log.truncateSize', null)
        this.hbLogTruncateIsInvalid.set(false)
      }
      await this.saveUiSettingChange('log.maxSize', value)
      this.hbLogSizeIsInvalid.set(false)
      setTimeout(() => {
        this.hbLogSizeIsSaving.set(false)
        this.$settings.showRestartToast()
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.hbLogSizeIsSaving.set(false)
    }
  }

  private async hbLogTruncateSave(value: number): Promise<void> {
    if (value && (typeof value !== 'number' || value < 0 || Number.isInteger(value) === false)) {
      this.hbLogTruncateIsInvalid.set(true)
      return
    }

    try {
      this.hbLogTruncateIsSaving.set(true)
      this.$settings.setEnvItem('log.truncateSize', value)
      await this.saveUiSettingChange('log.truncateSize', value)
      this.hbLogTruncateIsInvalid.set(false)
      setTimeout(() => {
        this.hbLogTruncateIsSaving.set(false)
        this.$settings.showRestartToast()
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.hbLogTruncateIsSaving.set(false)
    }
  }

  private async hbMDnsSave(value: string): Promise<void> {
    try {
      this.hbMDnsIsSaving.set(true)
      await this.$api.put('/server/mdns-advertiser', { advertiser: value })
      setTimeout(() => {
        this.hbMDnsIsSaving.set(false)
        this.$settings.showRestartToast()
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.hbMDnsIsSaving.set(false)
    }
  }

  private async hbPortSave(value: number): Promise<void> {
    if (value === this.uiPortFormControl.value) {
      this.hbPortIsInvalid.set(true)
      return
    }

    try {
      this.hbPortIsSaving.set(true)
      await this.$api.put('/server/port', { port: value })
      this.hbPortIsInvalid.set(false)
      setTimeout(() => {
        this.hbPortIsSaving.set(false)
        this.$settings.showRestartToast()
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.hbPortIsSaving.set(false)
    }
  }

  private async hbStartPortSave(value: number): Promise<void> {
    if (value && (typeof value !== 'number' || !Number.isInteger(value) || value < 1025 || value > 65533)) {
      this.hbStartPortIsInvalid.set(true)
      return
    }
    const end = this.hbEndPortFormControl.value
    if (value && end && value >= end) {
      this.hbStartPortIsInvalid.set(true)
      return
    }
    try {
      this.hbStartPortIsSaving.set(true)
      this.hbStartPortIsInvalid.set(false)
      await this.$api.put('/server/ports', { start: value || undefined, end: end || undefined })
      setTimeout(() => {
        this.hbStartPortIsSaving.set(false)
        this.$settings.showRestartToast()
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.hbStartPortIsSaving.set(false)
      this.hbStartPortIsInvalid.set(true)
    }
  }

  private async hbEndPortSave(value: number): Promise<void> {
    if (value && (typeof value !== 'number' || !Number.isInteger(value) || value < 1025 || value > 65533)) {
      this.hbEndPortIsInvalid.set(true)
      return
    }
    const start = this.hbStartPortFormControl.value
    if (value && start && start >= value) {
      this.hbEndPortIsInvalid.set(true)
      return
    }
    try {
      this.hbEndPortIsSaving.set(true)
      this.hbEndPortIsInvalid.set(false)
      await this.$api.put('/server/ports', { start: start || undefined, end: value || undefined })
      setTimeout(() => {
        this.hbEndPortIsSaving.set(false)
        this.$settings.showRestartToast()
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.hbEndPortIsSaving.set(false)
      this.hbEndPortIsInvalid.set(true)
    }
  }

  private async uiPortSave(value: number): Promise<void> {
    if (!value || typeof value !== 'number' || value < 1025 || value > 65533 || Number.isInteger(value) === false || value === this.hbPortFormControl.value) {
      this.uiPortIsInvalid.set(true)
      return
    }

    try {
      this.uiPortIsSaving.set(true)
      this.$settings.setEnvItem('port', value)
      await this.saveUiSettingChange('port', value)
      this.uiPortIsInvalid.set(false)
      setTimeout(() => {
        this.uiPortIsSaving.set(false)
        this.$settings.showRestartToast()
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiPortIsSaving.set(false)
    }
  }

  private async uiAuthSave(value: boolean): Promise<void> {
    try {
      this.uiAuthIsSaving.set(true)
      this.$settings.setItem('formAuth', value)
      await this.saveUiSettingChange('auth', value ? 'form' : 'none')
      this.$notification.formAuthEnabled.set(value)
      setTimeout(() => {
        this.uiAuthIsSaving.set(false)
        this.$settings.showRestartToast()
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiAuthIsSaving.set(false)
    }
  }

  private async uiSessionTimeoutSaveFromFields(): Promise<void> {
    const days = this.normalizeSessionTimeoutField(this.uiSessionTimeoutDaysFormControl, this.uiSessionTimeoutDaysIsInvalid, 0, 365)
    const hours = this.normalizeSessionTimeoutField(this.uiSessionTimeoutHoursFormControl, this.uiSessionTimeoutHoursIsInvalid, 0, 23)
    const minutes = this.normalizeSessionTimeoutField(this.uiSessionTimeoutMinutesFormControl, this.uiSessionTimeoutMinutesIsInvalid, 0, 59)

    if (days === null || hours === null || minutes === null) {
      return
    }

    // Convert to seconds
    const totalSeconds = (days * 86400) + (hours * 3600) + (minutes * 60)

    // Validate total: minimum 10 minutes (600 seconds)
    if (totalSeconds < 600) {
      this.uiSessionTimeoutMinutesIsInvalid.set(true)
      return
    }

    try {
      this.uiSessionTimeoutIsSaving.set(true)
      this.$settings.setItem('sessionTimeout', totalSeconds)
      await this.saveUiSettingChange('sessionTimeout', totalSeconds)
      this.uiSessionTimeoutDaysIsInvalid.set(false)
      this.uiSessionTimeoutHoursIsInvalid.set(false)
      this.uiSessionTimeoutMinutesIsInvalid.set(false)
      setTimeout(() => {
        this.uiSessionTimeoutIsSaving.set(false)
        this.$settings.showRestartToast()
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiSessionTimeoutIsSaving.set(false)
    }
  }

  private normalizeSessionTimeoutField(
    control: FormControl<number | null>,
    invalidSignal: WritableSignal<boolean>,
    min: number,
    max: number,
  ): number | null {
    const value = control.value ?? 0

    if (typeof value !== 'number' || Number.isNaN(value) || value < min || value > max || !Number.isInteger(value)) {
      invalidSignal.set(true)
      return null
    }

    invalidSignal.set(false)
    control.patchValue(value, { emitEvent: false })
    return value
  }

  private async uiSessionTimeoutInactivityBasedSave(value: boolean): Promise<void> {
    try {
      this.uiSessionTimeoutInactivityBasedIsSaving.set(true)
      this.$settings.setItem('sessionTimeoutInactivityBased', value)
      await this.saveUiSettingChange('sessionTimeoutInactivityBased', value)
      setTimeout(() => {
        this.uiSessionTimeoutInactivityBasedIsSaving.set(false)
        this.$settings.showRestartToast()
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiSessionTimeoutInactivityBasedIsSaving.set(false)
    }
  }

  private async uiSslKeySave(value: string): Promise<void> {
    try {
      this.uiSslKeyIsSaving.set(true)
      this.$settings.setEnvItem('ssl.key', value)
      await this.saveUiSettingChange('ssl.key', value)
      setTimeout(() => {
        this.uiSslKeyIsSaving.set(false)
        this.$settings.showRestartToast()
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiSslKeyIsSaving.set(false)
    }
  }

  private async uiSslCertSave(value: string): Promise<void> {
    try {
      this.uiSslCertIsSaving.set(true)
      this.$settings.setEnvItem('ssl.cert', value)
      await this.saveUiSettingChange('ssl.cert', value)
      setTimeout(() => {
        this.uiSslCertIsSaving.set(false)
        this.$settings.showRestartToast()
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiSslCertIsSaving.set(false)
    }
  }

  private async uiSslPfxSave(value: string): Promise<void> {
    try {
      this.uiSslPfxIsSaving.set(true)
      this.$settings.setEnvItem('ssl.pfx', value)
      await this.saveUiSettingChange('ssl.pfx', value)
      setTimeout(() => {
        this.uiSslPfxIsSaving.set(false)
        this.$settings.showRestartToast()
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiSslPfxIsSaving.set(false)
    }
  }

  private async uiSslPassphraseSave(value: string): Promise<void> {
    try {
      this.uiSslPassphraseIsSaving.set(true)
      this.$settings.setEnvItem('ssl.passphrase', value)
      await this.saveUiSettingChange('ssl.passphrase', value)
      setTimeout(() => {
        this.uiSslPassphraseIsSaving.set(false)
        this.$settings.showRestartToast()
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiSslPassphraseIsSaving.set(false)
    }
  }

  private async uiSslSelfSignedHostnamesSave(value: string): Promise<void> {
    try {
      this.uiSslSelfSignedHostnamesIsSaving.set(true)
      // Convert comma-separated string to array, trim whitespace
      const hostnames = value.split(',').map(h => h.trim()).filter(h => h.length > 0)
      this.$settings.setEnvItem('ssl.selfSignedHostnames', hostnames)
      await this.saveUiSettingChange('ssl.selfSignedHostnames', hostnames)
      setTimeout(() => {
        this.uiSslSelfSignedHostnamesIsSaving.set(false)
        this.$settings.showRestartToast()
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiSslSelfSignedHostnamesIsSaving.set(false)
    }
  }

  private async uiSslTypeSave(value: string): Promise<void> {
    switch (value) {
      case 'keycert':
        this.uiSslPfxFormControl.patchValue('', { emitEvent: false })
        this.uiSslPassphraseFormControl.patchValue('', { emitEvent: false })
        this.$settings.setEnvItem('ssl.pfx', '')
        this.$settings.setEnvItem('ssl.passphrase', '')
        this.$settings.setEnvItem('ssl.selfSigned', false)
        await this.saveUiSettingChange('ssl.selfSigned', false)
        break
      case 'pfx':
        this.uiSslKeyFormControl.patchValue('', { emitEvent: false })
        this.uiSslCertFormControl.patchValue('', { emitEvent: false })
        this.$settings.setEnvItem('ssl.key', '')
        this.$settings.setEnvItem('ssl.cert', '')
        this.$settings.setEnvItem('ssl.selfSigned', false)
        await this.saveUiSettingChange('ssl.selfSigned', false)
        break
      case 'selfsigned':
        this.uiSslKeyFormControl.patchValue('', { emitEvent: false })
        this.uiSslCertFormControl.patchValue('', { emitEvent: false })
        this.uiSslPfxFormControl.patchValue('', { emitEvent: false })
        this.uiSslPassphraseFormControl.patchValue('', { emitEvent: false })
        this.$settings.setEnvItem('ssl.key', '')
        this.$settings.setEnvItem('ssl.cert', '')
        this.$settings.setEnvItem('ssl.pfx', '')
        this.$settings.setEnvItem('ssl.passphrase', '')
        this.$settings.setEnvItem('ssl.selfSigned', true)
        await this.saveUiSettingChange('ssl.selfSigned', true)
        // Initialize with default hostnames if not set
        if (!this.uiSslSelfSignedHostnamesFormControl.value) {
          this.uiSslSelfSignedHostnamesFormControl.patchValue('localhost, 127.0.0.1', { emitEvent: true })
        }
        this.$settings.showRestartToast()
        break
      default:
        this.uiSslKeyFormControl.patchValue('', { emitEvent: false })
        this.uiSslCertFormControl.patchValue('', { emitEvent: false })
        this.uiSslPfxFormControl.patchValue('', { emitEvent: false })
        this.uiSslPassphraseFormControl.patchValue('', { emitEvent: false })
        this.uiSslSelfSignedHostnamesFormControl.patchValue('', { emitEvent: false })
        this.$settings.setEnvItem('ssl.key', '')
        this.$settings.setEnvItem('ssl.cert', '')
        this.$settings.setEnvItem('ssl.pfx', '')
        this.$settings.setEnvItem('ssl.passphrase', '')
        this.$settings.setEnvItem('ssl.selfSigned', false)
        this.$settings.setEnvItem('ssl.selfSignedHostnames', [])
        await this.saveUiSettingChange('ssl', '')
        this.$settings.showRestartToast()
    }
  }

  private async uiHostSave(value: string): Promise<void> {
    try {
      this.uiHostIsSaving.set(true)
      this.$settings.setItem('host', value)
      await this.saveUiSettingChange('host', value)
      setTimeout(() => {
        this.uiHostIsSaving.set(false)
        this.$settings.showRestartToast()
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiHostIsSaving.set(false)
    }
  }

  private async uiProxyHostSave(value: string): Promise<void> {
    try {
      this.uiProxyHostIsSaving.set(true)
      this.$settings.setItem('proxyHost', value)
      await this.saveUiSettingChange('proxyHost', value)
      setTimeout(() => {
        this.uiProxyHostIsSaving.set(false)
        this.$settings.showRestartToast()
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiProxyHostIsSaving.set(false)
    }
  }

  private async hbPackageSave(value: string): Promise<void> {
    try {
      this.hbPackageIsSaving.set(true)
      this.$settings.setEnvItem('homebridgePackagePath', value)
      await this.saveUiSettingChange('homebridgePackagePath', value)
      setTimeout(() => {
        this.hbPackageIsSaving.set(false)
        this.$settings.showRestartToast()
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.hbPackageIsSaving.set(false)
    }
  }

  private async uiMetricsSave(value: boolean): Promise<void> {
    try {
      this.uiMetricsIsSaving.set(true)
      this.$settings.setEnvItem('disableServerMetricsMonitoring', !value)
      await this.saveUiSettingChange('disableServerMetricsMonitoring', !value)
      setTimeout(() => {
        this.uiMetricsIsSaving.set(false)
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {})
          .catch(error => console.error(error))
          .finally(() => this.$settings.showRestartToast())
          .catch((error) => {
            console.error(error)
            this.$settings.showRestartToast()
          })
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiMetricsIsSaving.set(false)
    }
  }

  private async enableMdnsAdvertiseSave(value: boolean): Promise<void> {
    try {
      this.enableMdnsAdvertiseIsSaving.set(true)
      this.$settings.setEnvItem('enableMdnsAdvertise', value)
      await this.saveUiSettingChange('enableMdnsAdvertise', value)
      setTimeout(() => {
        this.enableMdnsAdvertiseIsSaving.set(false)
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {})
          .catch(error => console.error(error))
          .finally(() => this.$settings.showRestartToast())
          .catch((error) => {
            console.error(error)
            this.$settings.showRestartToast()
          })
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
    }
  }

  private async uiAccDebugSave(value: boolean): Promise<void> {
    try {
      this.uiAccDebugIsSaving.set(true)
      this.$settings.setEnvItem('accessoryControl.debug', value)
      await this.saveUiSettingChange('accessoryControl.debug', value)
      setTimeout(() => {
        this.uiAccDebugIsSaving.set(false)
        this.$settings.showRestartToast()
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiAccDebugIsSaving.set(false)
    }
  }

  private async uiTempFileSave(value: string): Promise<void> {
    try {
      this.uiTempFileIsSaving.set(true)
      this.$settings.setEnvItem('temp', value)
      await this.saveUiSettingChange('temp', value)
      setTimeout(() => {
        this.uiTempFileIsSaving.set(false)
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {})
          .catch(error => console.error(error))
          .finally(() => this.$settings.showRestartToast())
          .catch((error) => {
            console.error(error)
            this.$settings.showRestartToast()
          })
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.uiTempFileIsSaving.set(false)
    }
  }

  private async hbLinuxShutdownSave(value: string): Promise<void> {
    try {
      this.hbLinuxShutdownIsSaving.set(true)
      this.$settings.setEnvItem('linux.shutdown', value)
      await this.saveUiSettingChange('linux.shutdown', value)
      setTimeout(() => {
        this.hbLinuxShutdownIsSaving.set(false)
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {})
          .catch(error => console.error(error))
          .finally(() => this.$settings.showRestartToast())
          .catch((error) => {
            console.error(error)
            this.$settings.showRestartToast()
          })
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.hbLinuxShutdownIsSaving.set(false)
    }
  }

  private async hbLinuxRestartSave(value: string): Promise<void> {
    try {
      this.hbLinuxRestartIsSaving.set(true)
      this.$settings.setEnvItem('linux.restart', value)
      await this.saveUiSettingChange('linux.restart', value)
      setTimeout(() => {
        this.hbLinuxRestartIsSaving.set(false)
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {})
          .catch(error => console.error(error))
          .finally(() => this.$settings.showRestartToast())
          .catch((error) => {
            console.error(error)
            this.$settings.showRestartToast()
          })
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.hbLinuxRestartIsSaving.set(false)
    }
  }

  private validateCronExpression(cron: string): boolean {
    // Empty is valid (disables scheduled restart)
    if (!cron || !cron.trim()) {
      return true
    }

    // Must have exactly 5 fields: minute hour day month weekday
    const fields = cron.trim().split(RE_WHITESPACE_SINGLE)
    if (fields.length !== 5) {
      return false
    }

    return fields.every(field => RE_CRON_FIELD.test(field))
  }

  private async scheduledRestartCronSave(value: string): Promise<void> {
    // Validate cron expression
    if (!this.validateCronExpression(value)) {
      this.scheduledRestartCronIsInvalid.set(true)
      return
    }

    this.scheduledRestartCronIsInvalid.set(false)

    try {
      this.scheduledRestartCronIsSaving.set(true)
      // Convert empty string to null
      const cronValue = value?.trim() ? value : null
      this.$settings.setEnvItem('scheduledRestartCron', cronValue)
      await this.saveUiSettingChange('scheduledRestartCron', cronValue)
      setTimeout(() => {
        this.scheduledRestartCronIsSaving.set(false)
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {})
          .catch(error => console.error(error))
          .finally(() => this.$settings.showRestartToast())
          .catch((error) => {
            console.error(error)
            this.$settings.showRestartToast()
          })
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.scheduledRestartCronIsSaving.set(false)
    }
  }

  private async deleteInvalidSetting(key: string) {
    try {
      await this.$api.delete(`/config-editor/ui/${key}`)
    } catch (error: any) {
      console.error(`Failed to delete invalid setting ${key}:`, error)
    }
  }

  private async initMatterSettings(): Promise<void> {
    try {
      const [matterConfig, matterPorts] = await Promise.all([
        this.$api.get('/config-editor/matter'),
        this.$api.get<{ start?: number, end?: number }>('/config-editor/matter/ports'),
      ])

      // null = Matter not configured. A block with `enabled: false` is the
      // in-place disabled state (configured but off) — treat it as disabled.
      const isEnabled = matterConfig !== null && matterConfig.enabled !== false

      // Remember the configured port (even when disabled in place) so re-enabling
      // reuses it and keeps the existing commissioning storage.
      if (matterConfig?.port) {
        this.matterConfigCache = { port: matterConfig.port }
      }

      if (isEnabled) {
        // Matter is enabled - populate fields with config values
        this.matterPortFormControl.patchValue(matterConfig.port || '', { emitEvent: false })
      } else {
        // Matter is disabled - set default values but don't show fields
        this.matterPortFormControl.patchValue(0, { emitEvent: false })
      }

      // Subscribe to form changes
      this.matterPortFormControl.valueChanges
        .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
        .subscribe(value => this.matterPortSave(value!))

      // Matter port range
      this.matterStartPortFormControl.patchValue(matterPorts.start ?? null, { emitEvent: false })
      this.matterStartPortFormControl.valueChanges
        .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
        .subscribe(value => this.matterStartPortSave(value!))

      this.matterEndPortFormControl.patchValue(matterPorts.end ?? null, { emitEvent: false })
      this.matterEndPortFormControl.valueChanges
        .pipe(debounceTime(1500), takeUntilDestroyed(this.destroyRef))
        .subscribe(value => this.matterEndPortSave(value!))

      // Set enabled state
      this.matterEnabledFormControl.patchValue(isEnabled, { emitEvent: false })
      // externalsOnly is only meaningful when matter.enabled === false. Read
      // and subscribe regardless so toggling produces a save.
      this.matterExternalsOnlyFormControl.patchValue(matterConfig?.externalsOnly === true, { emitEvent: false })

      // Subscribe to toggle changes. takeUntilDestroyed prevents the
      // patchValue from a slow save fanning out a stale save back into
      // the API after the user has navigated away.
      this.matterEnabledFormControl.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(value => this.matterEnabledSave(value!))
      if (this.isProtocolExternalsOnlyEnabled) {
        this.matterExternalsOnlyFormControl.valueChanges
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(value => this.matterExternalsOnlySave(value === true))
      }
    } catch (error: any) {
      console.error(error)
      // Don't show error toast - Matter might not be configured yet
      // Subscribe to toggle changes even if config doesn't exist yet
      this.matterEnabledFormControl.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(value => this.matterEnabledSave(value!))
    }
  }

  /**
   * Save the Matter externalsOnly flag. Only meaningful when Matter is
   * disabled in place. Uses the existing /matter/enabled endpoint with
   * `enabled: false` plus the new `externalsOnly` field.
   */
  private async matterExternalsOnlySave(value: boolean): Promise<void> {
    if (this.matterEnabledFormControl.value !== false) {
      return
    }
    try {
      this.matterExternalsOnlyIsSaving.set(true)
      await this.$api.put('/config-editor/matter/enabled', { enabled: false, externalsOnly: value, restart: false })
      await this.requestFullServiceRestart()
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.matterExternalsOnlyFormControl.patchValue(!value, { emitEvent: false })
    } finally {
      this.matterExternalsOnlyIsSaving.set(false)
    }
  }

  private async matterPortSave(value: number): Promise<void> {
    // Port is optional - if empty/null/undefined, just save without validation
    if (!value && value !== 0) {
      // Empty value is valid (optional field)
      try {
        this.matterPortIsSaving.set(true)
        this.matterPortIsInvalid.set(false)
        await this.$api.put('/config-editor/matter', {
          port: undefined,
        })
        setTimeout(() => {
          this.matterPortIsSaving.set(false)
          this.$settings.showRestartToast()
        }, 1000)
      } catch (error: any) {
        console.error(error)
        this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
        this.matterPortIsSaving.set(false)
      }
      return
    }

    // If a value is provided, validate it
    if (typeof value !== 'number' || value < 1024 || value > 65535 || Number.isInteger(value) === false) {
      this.matterPortIsInvalid.set(true)
      return
    }

    // Check for reserved ports
    if ([5353, 8080, 8443].includes(value)) {
      this.matterPortIsInvalid.set(true)
      this.$toastr.error('Port 5353, 8080, and 8443 are reserved and cannot be used', this.$translate.instant('toast.title_error'))
      return
    }

    try {
      this.matterPortIsSaving.set(true)
      this.matterPortIsInvalid.set(false)
      await this.$api.put('/config-editor/matter', {
        port: value,
      })
      setTimeout(() => {
        this.matterPortIsSaving.set(false)
        this.$settings.showRestartToast()
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.matterPortIsSaving.set(false)
      this.matterPortIsInvalid.set(true)
    }
  }

  private async matterStartPortSave(value: number): Promise<void> {
    if (value && (typeof value !== 'number' || !Number.isInteger(value) || value < 1025 || value > 65533)) {
      this.matterStartPortIsInvalid.set(true)
      return
    }
    const end = this.matterEndPortFormControl.value
    if (value && end && value >= end) {
      this.matterStartPortIsInvalid.set(true)
      return
    }
    try {
      this.matterStartPortIsSaving.set(true)
      this.matterStartPortIsInvalid.set(false)
      await this.$api.put('/config-editor/matter/ports', { start: value || undefined, end: end || undefined })
      setTimeout(() => {
        this.matterStartPortIsSaving.set(false)
        this.$settings.showRestartToast()
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.matterStartPortIsSaving.set(false)
      this.matterStartPortIsInvalid.set(true)
    }
  }

  private async matterEndPortSave(value: number): Promise<void> {
    if (value && (typeof value !== 'number' || !Number.isInteger(value) || value < 1025 || value > 65533)) {
      this.matterEndPortIsInvalid.set(true)
      return
    }
    const start = this.matterStartPortFormControl.value
    if (value && start && start >= value) {
      this.matterEndPortIsInvalid.set(true)
      return
    }
    try {
      this.matterEndPortIsSaving.set(true)
      this.matterEndPortIsInvalid.set(false)
      await this.$api.put('/config-editor/matter/ports', { start: start || undefined, end: value || undefined })
      setTimeout(() => {
        this.matterEndPortIsSaving.set(false)
        this.$settings.showRestartToast()
      }, 1000)
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.matterEndPortIsSaving.set(false)
      this.matterEndPortIsInvalid.set(true)
    }
  }

  private async matterEnabledSave(value: boolean): Promise<void> {
    // Refuse to disable Matter unless HAP is enabled — at least one protocol is
    // required unless the running Homebridge supports disabling all protocols.
    if (!value && !this.hapEnabledFormControl.value && !this.allowDisableAllProtocols) {
      this.$toastr.info(
        this.$translate.instant('settings.matter.requires_hap'),
        this.$translate.instant('toast.title_notice'),
      )
      this.matterEnabledFormControl.patchValue(true, { emitEvent: false })
      return
    }

    if (this.allowMatterDisableInPlace) {
      // Non-destructive: Matter commissioning is preserved (matter.enabled=false),
      // so skip the confirm modal and the immediate restart. Write the change,
      // flag a full service restart, and let the user restart via the toast.
      try {
        this.matterEnabledIsSaving.set(true)
        if (value) {
          // Enable: reuse the cached/allocated port. Writing the block clears any
          // `enabled: false`, and the preserved storage keeps commissioning.
          let port: number | undefined = this.matterConfigCache.port
          if (!port) {
            try {
              const portResponse = await this.$api.get('/server/port/new/matter')
              port = portResponse!.port
            } catch (error: any) {
              console.error('Failed to get Matter port, using fallback', error)
              port = Math.floor(Math.random() * (5541 - 5530 + 1) + 5530)
            }
          }
          await this.$api.put('/config-editor/matter', { port })
          if (port !== undefined) {
            this.matterPortFormControl.patchValue(port, { emitEvent: false })
          }
          this.matterConfigCache = { port }
          // Re-enabling clears externalsOnly — validation rejects enabled + externalsOnly.
          if (this.isProtocolExternalsOnlyEnabled) {
            this.matterExternalsOnlyFormControl.patchValue(false, { emitEvent: false })
          }
        } else {
          // Disable in place: keep the block, port and commissioning storage.
          this.matterConfigCache = { port: this.matterPortFormControl.value || undefined }
          const body: { enabled: boolean, restart: boolean, externalsOnly?: boolean } = { enabled: false, restart: false }
          if (this.isProtocolExternalsOnlyEnabled) {
            body.externalsOnly = this.matterExternalsOnlyFormControl.value === true
          }
          await this.$api.put('/config-editor/matter/enabled', body)
        }
        await this.requestFullServiceRestart()
      } catch (error: any) {
        console.error(error)
        this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
        this.matterEnabledFormControl.patchValue(!value, { emitEvent: false })
      } finally {
        this.matterEnabledIsSaving.set(false)
      }
      return
    }

    try {
      this.matterEnabledIsSaving.set(true)
      if (value) {
        // When enabling, restore cached port if it exists, otherwise query for available port
        let port: number | undefined

        if (this.matterConfigCache.port) {
          // Restore from cache
          port = this.matterConfigCache.port
        } else {
          // First time enabling - get an available Matter port from the server
          try {
            const portResponse = await this.$api.get('/server/port/new/matter')
            port = portResponse!.port
          } catch (error: any) {
            console.error('Failed to get Matter port, using fallback', error)
            // Fallback to Matter port range if API call fails
            port = Math.floor(Math.random() * (5541 - 5530 + 1) + 5530)
          }
        }

        await this.$api.put('/config-editor/matter', {
          port,
        })

        // Update the form value
        if (port !== undefined) {
          this.matterPortFormControl.patchValue(port, { emitEvent: false })
        }

        // Update cache with current value
        this.matterConfigCache = { port }

        setTimeout(() => {
          this.matterEnabledIsSaving.set(false)
          this.$settings.showRestartToast()
        }, 1000)
      } else {
        // When disabling, show confirmation modal
        const injector = createEnvironmentInjector([{
          provide: CONFIRM_MODAL_DATA,
          useValue: {
            title: this.$translate.instant('settings.matter.disable'),
            message: this.$translate.instant(this.allowMatterDisableInPlace ? 'settings.matter.disable_desc_in_place' : 'settings.matter.disable_desc'),
            message2: this.$translate.instant('common.phrases.are_you_sure'),
            confirmButtonLabel: this.$translate.instant('form.button_continue'),
            confirmButtonClass: 'btn-danger',
            faIconClass: 'fas fa-exclamation-triangle text-warning',
          },
        }], this.injector)

        const ref = this.$modal.open(ConfirmComponent, {
          size: 'lg',
          backdrop: 'static',
          injector,
        })

        try {
          // Wait for user confirmation
          await ref.result

          // User confirmed - cache the current port value before deleting
          this.matterConfigCache = {
            port: this.matterPortFormControl.value || undefined,
          }

          // Hide the restart toast if it's shown
          if (this.$settings.restartToastRef) {
            this.$toastr.clear(this.$settings.restartToastRef.toastId)
            this.$settings.restartToastRef = null
          }

          void this.$router.navigate(['/restart'], {
            queryParams: { alreadyRestarting: 'true' },
          })
          if (this.allowMatterDisableInPlace) {
            // Non-destructive disable: keep the config block + commissioning
            // storage, just mark Matter off so re-enabling needs no re-pairing.
            await this.$api.put('/config-editor/matter/enabled', { enabled: false })
          } else {
            // Legacy teardown on older Homebridge: remove the block and its storage.
            await this.$api.delete('/config-editor/matter')
          }
        } catch (error: any) {
          if (error === 'Dismiss') {
            // User canceled - revert the toggle
            this.matterEnabledFormControl.patchValue(true, { emitEvent: false })
            this.matterEnabledIsSaving.set(false)
          } else {
            // Actual error - show error message and revert toggle
            console.error(error)
            this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
            this.matterEnabledFormControl.patchValue(true, { emitEvent: false })
            this.matterEnabledIsSaving.set(false)
          }
        }
      }
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.matterEnabledFormControl.patchValue(value, { emitEvent: false })
      this.matterEnabledIsSaving.set(false)
    }
  }

  private async initHapSettings(): Promise<void> {
    try {
      const { enabled, externalsOnly } = await this.$api.get<{ enabled: boolean, externalsOnly?: boolean }>('/config-editor/hap')
      this.hapEnabledFormControl.patchValue(enabled, { emitEvent: false })
      this.hapExternalsOnlyFormControl.patchValue(externalsOnly === true, { emitEvent: false })
    } catch (error: any) {
      console.error(error)
      // Fall back to enabled (default) — subscribe regardless so user can change it
      this.hapEnabledFormControl.patchValue(true, { emitEvent: false })
      this.hapExternalsOnlyFormControl.patchValue(false, { emitEvent: false })
    }
    this.hapEnabledFormControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.hapEnabledSave(value!))
    if (this.isProtocolExternalsOnlyEnabled) {
      this.hapExternalsOnlyFormControl.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(value => this.hapExternalsOnlySave(value === true))
    }
  }

  /**
   * Save the HAP externalsOnly flag. Only meaningful when HAP is disabled.
   * Re-uses the existing /hap endpoint with `enabled: false` plus the new
   * `externalsOnly` field, which the backend writes alongside enabled: false.
   */
  private async hapExternalsOnlySave(value: boolean): Promise<void> {
    if (this.hapEnabledFormControl.value !== false) {
      // Defensive: should be hidden in the UI but guard against direct invocation.
      return
    }
    try {
      this.hapExternalsOnlyIsSaving.set(true)
      await this.$api.put('/config-editor/hap', { enabled: false, externalsOnly: value, restart: false })
      await this.requestFullServiceRestart()
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.hapExternalsOnlyFormControl.patchValue(!value, { emitEvent: false })
    } finally {
      this.hapExternalsOnlyIsSaving.set(false)
    }
  }

  private async hapEnabledSave(value: boolean): Promise<void> {
    // Refuse to disable HAP unless Matter is enabled — at least one protocol is
    // required unless the running Homebridge supports disabling all protocols.
    if (!value && !this.matterEnabledFormControl.value && !this.allowDisableAllProtocols) {
      this.$toastr.info(
        this.$translate.instant('settings.hap.requires_matter'),
        this.$translate.instant('toast.title_notice'),
      )
      this.hapEnabledFormControl.patchValue(true, { emitEvent: false })
      return
    }

    if (this.allowMatterDisableInPlace) {
      // Non-destructive: HAP pairing is always preserved, so skip the confirm
      // modal and the immediate restart. Write the change, flag a full service
      // restart, and let the user restart via the toast when ready.
      try {
        this.hapEnabledIsSaving.set(true)
        const body: { enabled: boolean, restart: boolean, externalsOnly?: boolean } = { enabled: value, restart: false }
        // When disabling HAP, propagate the current externalsOnly setting (if the
        // feature is supported). When re-enabling, clear it from the form too —
        // the backend already drops the property entirely.
        if (this.isProtocolExternalsOnlyEnabled) {
          if (!value) {
            body.externalsOnly = this.hapExternalsOnlyFormControl.value === true
          } else {
            this.hapExternalsOnlyFormControl.patchValue(false, { emitEvent: false })
          }
        }
        await this.$api.put('/config-editor/hap', body)
        await this.requestFullServiceRestart()
      } catch (error: any) {
        console.error(error)
        this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
        this.hapEnabledFormControl.patchValue(!value, { emitEvent: false })
      } finally {
        this.hapEnabledIsSaving.set(false)
      }
      return
    }

    try {
      this.hapEnabledIsSaving.set(true)
      if (value) {
        await this.$api.put('/config-editor/hap', { enabled: true })
        setTimeout(() => {
          this.hapEnabledIsSaving.set(false)
          this.$settings.showRestartToast()
        }, 1000)
      } else {
        // Disabling HAP — confirm first
        const injector = createEnvironmentInjector([{
          provide: CONFIRM_MODAL_DATA,
          useValue: {
            title: this.$translate.instant('settings.hap.disable'),
            message: this.$translate.instant('settings.hap.disable_desc'),
            message2: this.$translate.instant('common.phrases.are_you_sure'),
            confirmButtonLabel: this.$translate.instant('form.button_continue'),
            confirmButtonClass: 'btn-danger',
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

          if (this.$settings.restartToastRef) {
            this.$toastr.clear(this.$settings.restartToastRef.toastId)
            this.$settings.restartToastRef = null
          }

          void this.$router.navigate(['/restart'], {
            queryParams: { alreadyRestarting: 'true' },
          })
          await this.$api.put('/config-editor/hap', { enabled: false })
        } catch (error: any) {
          if (error === 'Dismiss') {
            this.hapEnabledFormControl.patchValue(true, { emitEvent: false })
            this.hapEnabledIsSaving.set(false)
          } else {
            console.error(error)
            this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
            this.hapEnabledFormControl.patchValue(true, { emitEvent: false })
            this.hapEnabledIsSaving.set(false)
          }
        }
      }
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.hapEnabledFormControl.patchValue(!value, { emitEvent: false })
      this.hapEnabledIsSaving.set(false)
    }
  }

  private buildBridgeNetworkAdapterList(adapters: string[]) {
    if (!adapters.length) {
      this.adaptersSelected.set([])
      return
    }

    this.adaptersSelected.set(adapters.map((interfaceName) => {
      const i = this.adaptersAvailable().find(x => x.iface === interfaceName)
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
    }))
  }

  // Flag the next restart as a full service restart — enabling/disabling HAP or
  // Matter changes how the homebridge process starts, so it needs the whole
  // service to restart — then surface the normal restart toast (deferred, the
  // user restarts when ready). Mirrors how other restart-requiring settings save.
  private async requestFullServiceRestart(): Promise<void> {
    try {
      await this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {})
    } catch (error) {
      console.error(error)
    } finally {
      this.$settings.showRestartToast()
    }
  }
}
