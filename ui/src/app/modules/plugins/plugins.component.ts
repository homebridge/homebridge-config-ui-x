import { Component, DestroyRef, ElementRef, inject, OnDestroy, OnInit, signal, viewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NavigationEnd, Router, Event as RouterEvent } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { Observable } from 'rxjs'

import { AuthService } from '@/app/core/auth/auth.service'
import { ApiService } from '@/app/core/communication/api.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { SpinnerComponent } from '@/app/core/components/spinner/spinner.component'
import { ChildBridge, Plugin } from '@/app/core/plugins/manage-plugins.interfaces'
import { ManagePluginsService } from '@/app/core/plugins/manage-plugins.service'
import { SettingsService } from '@/app/core/ui/settings.service'
import { PluginCardComponent } from '@/app/modules/plugins/plugin-card/plugin-card.component'
import { PluginSupportComponent } from '@/app/modules/plugins/plugin-support/plugin-support.component'

export interface CanComponentDeactivate {
  canDeactivate: (nextUrl?: string) => Observable<boolean> | Promise<boolean> | boolean
}

@Component({
  templateUrl: './plugins.component.html',
  styleUrls: ['./plugins.component.scss'],
  standalone: true,
  imports: [
    SpinnerComponent,
    FormsModule,
    ReactiveFormsModule,
    PluginCardComponent,
    TranslatePipe,
    NgbTooltip,
  ],
})

export class PluginsComponent implements OnInit, OnDestroy, CanComponentDeactivate {
  // Injected dependencies
  private destroyRef = inject(DestroyRef)
  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $modal = inject(NgbModal)
  private $plugin = inject(ManagePluginsService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)

  // ViewChild queries
  readonly searchInput = viewChild<ElementRef>('searchInput')

  // Signals
  public mainError = signal(false)
  public loading = signal(true)
  public tab = signal<'main' | 'stats'>('main')
  public installedPlugins = signal<Plugin[]>([])
  public childBridges = signal<ChildBridge[]>([])
  public showSearchBar = signal(false)
  public showExitButton = signal(false)

  // Other properties
  private isSearchMode = signal(false)
  private io: IoNamespace
  public readonly isAdmin = this.$auth.user.admin
  public form = new FormGroup({
    query: new FormControl<string>(''),
  })

  public ngOnInit(): void {
    // Set page title
    const title = this.$translate.instant('menu.label_plugins')
    this.$settings.setPageTitle(title)

    // Subscribe to plugin list refresh events
    this.$plugin.onPluginListRefresh
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.loadInstalledPlugins()
        this.getChildBridgeMetadata()
      })

    this.io = this.$ws.connectToNamespace('child-bridges')

    // Subscribe to connection events for reconnections
    this.io.connected.subscribe(() => {
      void this.initialize()
    })

    // If already connected, initialize immediately
    if (this.io.socket.connected) {
      void this.initialize()
    }

    this.io.socket.on('child-bridge-status-update', (data) => {
      const existingBridge = this.childBridges().find(x => x.username === data.username)
      if (existingBridge) {
        Object.assign(existingBridge, data)

        // Trigger signal update
        this.childBridges.set([...this.childBridges()])
      } else {
        this.childBridges.update(bridges => [...bridges, data])
      }
    })

    this.$router.events
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((e: RouterEvent) => {
        // If it is a NavigationEnd event re-initialize the component
        if (e instanceof NavigationEnd) {
          void this.loadInstalledPlugins()
        }
      })
  }

  public async search(): Promise<void> {
    this.installedPlugins.set([])
    this.loading.set(true)
    this.showExitButton.set(true)

    try {
      const data = await this.$api.get<Plugin[]>(`/plugins/search/${encodeURIComponent(this.form.value.query)}`)

      // Some filtering in regard to the changeover to scoped plugins
      // A plugin may have two versions, like homebridge-foo and @homebridge-plugins/homebridge-foo
      // If the user does not have either installed, or has the scoped version installed, then hide the unscoped version
      // If the user has the unscoped version installed, but not the scoped version, then hide the scoped version
      const hiddenPlugins = new Set<string>()
      const pluginMap = new Map(data.map((plugin: Plugin) => [plugin.name, plugin]))
      this.installedPlugins.set(data
        .reduce((acc: Plugin[], x: Plugin) => {
          if (x.name === 'homebridge-config-ui-x' || hiddenPlugins.has(x.name)) {
            return acc
          }
          if (x.newHbScope) {
            const y = x.newHbScope.to
            const yExists = pluginMap.has(y)
            if (x.installedVersion || !yExists) {
              hiddenPlugins.add(y)
              acc.push(x)
            }
          } else {
            acc.push(x)
          }
          return acc
        }, []))
      await this.appendMetaInfo()
    } catch (error) {
      this.isSearchMode.set(false)
      console.error(error)
      const message = error instanceof Error ? error.message : this.$translate.instant('plugins.toast_failed_to_search_plugins')
      this.$toastr.error(message, this.$translate.instant('toast.title_error'))
      void this.loadInstalledPlugins()
    } finally {
      this.loading.set(false)
    }
  }

  public onClearSearch(): void {
    this.form.setValue({ query: '' })
    this.showExitButton.set(false)
    if (this.isSearchMode()) {
      this.isSearchMode.set(false)
      void this.loadInstalledPlugins()
    }
  }

  public onSubmit({ value }): void {
    if (!value.query.length) {
      // Close search mode if in search mode
      if (this.isSearchMode()) {
        this.isSearchMode.set(false)
        void this.loadInstalledPlugins()
      }
      // Close search bar if empty
      this.showSearchBar.set(false)
    } else {
      this.isSearchMode.set(true)
      void this.search()
    }
  }

  public showSearch(): void {
    if (this.showSearchBar()) {
      this.showSearchBar.set(false)
      if (this.isSearchMode()) {
        this.isSearchMode.set(false)
        this.form.setValue({ query: '' })
        void this.loadInstalledPlugins()
      }
    } else {
      window.document.querySelector('body')?.classList.remove('bg-black')
      this.tab.set('main')
      this.showSearchBar.set(true)
      const input = this.searchInput()
      if (input) {
        setTimeout(() => input.nativeElement.focus(), 0)
      }
    }
  }

  public showStats(): void {
    if (this.tab() === 'stats') {
      // In dark mode, no animations needed
      if (this.$settings.actualLightingMode !== 'light') {
        window.document.querySelector('body').classList.remove('bg-black')
        this.tab.set('main')
        return
      }

      // Remove light-mode class from body
      window.document.querySelector('body').classList.remove('light-mode')

      // Fade out stats before switching to main
      const statsHeader = document.getElementById('stats-header')
      const statsIframe = document.getElementById('stats-iframe')

      if (statsHeader && statsIframe) {
        statsHeader.classList.add('fade-out')
        statsIframe.classList.add('fade-out')
      }

      // Wait for fade-out animation (250ms)
      setTimeout(() => {
        // Remove body bg color to trigger background transition
        window.document.querySelector('body').classList.remove('bg-black')

        // Wait for background transition before switching tab
        setTimeout(() => {
          this.tab.set('main')
        }, 250)
      }, 250)
    } else {
      // Set body bg color
      window.document.querySelector('body').classList.add('bg-black')
      this.tab.set('stats')
      this.showSearchBar.set(false)

      // Add light-mode class for animations (only in light mode)
      if (this.$settings.actualLightingMode === 'light') {
        window.document.querySelector('body').classList.add('light-mode')
        setTimeout(() => {
          const statsHeader = document.getElementById('stats-header')
          const statsIframe = document.getElementById('stats-iframe')
          if (statsHeader && statsIframe) {
            statsHeader.classList.add('light-mode')
            statsIframe.classList.add('light-mode')
          }
        }, 0)
      }
    }
  }

  public openSupport(): void {
    this.$modal.open(PluginSupportComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  public canDeactivate(nextUrl?: string): Promise<boolean> | boolean {
    // Only animate if we're on the stats tab
    if (this.tab() !== 'stats') {
      return true
    }

    // If in dark mode, no animations needed - navigate immediately
    if (this.$settings.actualLightingMode !== 'light') {
      window.document.querySelector('body').classList.remove('bg-black')
      return Promise.resolve(true)
    }

    // Remove light-mode class from body
    window.document.querySelector('body').classList.remove('light-mode')

    // Check if we're navigating to another black-background page
    const stayingBlack = nextUrl && (
      nextUrl.includes('/platform-tools/terminal')
      || nextUrl.includes('/logs')
    )

    return new Promise((resolve) => {
      // Fade out stats before leaving
      const statsHeader = document.getElementById('stats-header')
      const statsIframe = document.getElementById('stats-iframe')

      if (statsHeader && statsIframe) {
        statsHeader.classList.add('fade-out')
        statsIframe.classList.add('fade-out')
      }

      if (stayingBlack) {
        // Just fade out the stats, keep background black
        setTimeout(() => {
          resolve(true)
        }, 250)
      } else {
        // Wait for fade-out animation (250ms) and body background transition (250ms)
        setTimeout(() => {
          // Remove body bg color to trigger background transition
          window.document.querySelector('body').classList.remove('bg-black')
        }, 250)

        // Wait for both animations to complete before allowing navigation
        setTimeout(() => {
          resolve(true)
        }, 500)
      }
    })
  }

  public ngOnDestroy() {
    // Clean up light-mode class
    window.document.querySelector('body').classList.remove('light-mode')

    this.io.end()
  }

  public getPluginChildBridges(plugin: Plugin): ChildBridge[] {
    return this.childBridges().filter(x => x.plugin === plugin.name)
  }

  private async initialize(): Promise<void> {
    this.getChildBridgeMetadata()
    this.io.socket.emit('monitor-child-bridge-status')

    // Load list of installed plugins
    await this.loadInstalledPlugins()

    if (!this.installedPlugins().length) {
      this.showSearch()
    }

    // Get any query parameters
    const { action: queryAction, plugin: queryPlugin } = this.$router.parseUrl(this.$router.url).queryParams
    if (queryAction) {
      const plugin: Plugin | undefined = this.installedPlugins().find(x => x.name === queryPlugin)
      switch (queryAction) {
        case 'just-installed': {
          if (plugin) {
            if (plugin.isConfigured) {
              this.$modal.open(RestartHomebridgeComponent, {
                size: 'lg',
                backdrop: 'static',
              })
            } else {
              void this.$plugin.settings(plugin)
            }
          }
          break
        }
      }

      // Clear the query parameters so that we don't keep showing the same action
      void this.$router.navigate([], {
        queryParams: {},
        replaceUrl: true,
        queryParamsHandling: '',
      })
    }
  }

  private async loadInstalledPlugins(): Promise<Plugin[] | undefined> {
    this.form.setValue({ query: '' })
    this.showExitButton.set(false)
    this.installedPlugins.set([])
    this.loading.set(true)
    this.mainError.set(false)

    try {
      const installedPlugins = await this.$api.get<Plugin[]>('/plugins')
      this.installedPlugins.set(installedPlugins.filter((x: Plugin) => x.name !== 'homebridge-config-ui-x'))
      await this.appendMetaInfo()

      // Multi-criteria sorting
      const sortedList = this.installedPlugins().sort((a, b) => {
        // Priority 1: updateAvailable (=true)
        // Priority 2: newHbScope (=true)
        // Priority 3: disabled (=false)
        // Priority 4: isConfigured (=false) - unconfigured plugins need setup
        // Priority 5: hasChildBridgesUnpaired (=true) - unpaired bridges need pairing
        // Priority 6: hasChildBridges (=false)
        // Create sort keys for better performance
        const aScore = (a.updateAvailable ? 1000 : 0)
          + (a.newHbScope ? 100 : 0)
          + (a.disabled ? -10 : 0)
          + (a.isConfigured ? -20 : 0)
          + (a.hasChildBridgesUnpaired ? 5 : 0)
          + (a.hasChildBridges && this.$settings.env.recommendChildBridges ? -1 : 0)

        const bScore = (b.updateAvailable ? 1000 : 0)
          + (b.newHbScope ? 100 : 0)
          + (b.disabled ? -10 : 0)
          + (b.isConfigured ? -20 : 0)
          + (b.hasChildBridgesUnpaired ? 5 : 0)
          + (b.hasChildBridges && this.$settings.env.recommendChildBridges ? -1 : 0)

        // Compare scores first, then fallback to name
        return aScore !== bScore ? bScore - aScore : a.name.localeCompare(b.name)
      })

      this.installedPlugins.set(sortedList)
      return sortedList
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : this.$translate.instant('plugins.toast_failed_to_load_plugins')
      this.$toastr.error(message, this.$translate.instant('toast.title_error'))
      this.mainError.set(true)
    } finally {
      this.loading.set(false)
    }
  }

  private async appendMetaInfo(): Promise<void> {
    if (!this.isAdmin) {
      return
    }

    // Also get the current configuration for each plugin
    await Promise.all(this.installedPlugins()
      .filter(plugin => plugin.installedVersion)
      .map(async (plugin: Plugin) => {
        try {
          // Adds some extra properties to the plugin object for the plugin card
          const configBlocks = await this.$api.get<any[]>(`/config-editor/plugin/${encodeURIComponent(plugin.name)}`)
          plugin.isConfigured = configBlocks.length > 0
          plugin.isConfiguredDynamicPlatform = plugin.isConfigured && Object.hasOwn(configBlocks[0], 'platform')

          plugin.recommendChildBridge = plugin.isConfigured
            && this.$settings.env.recommendChildBridges
            && !['homebridge', 'homebridge-config-ui-x'].includes(plugin.name)

          plugin.hasChildBridges = plugin.isConfigured && configBlocks.some(x => x._bridge && x._bridge.username)

          const pluginChildBridges = this.getPluginChildBridges(plugin)

          // Check for unpaired HAP bridges OR unpaired Matter bridges that are NOT hidden
          plugin.hasChildBridgesUnpaired = pluginChildBridges.some((x) => {
            const hasUnpairedHap = x.paired === false && !this.isBridgeAlertHidden(x.username, 'hap')
            const hasUnpairedMatter = x.matterConfig && x.matterCommissioned === false && !this.isBridgeAlertHidden(x.username, 'matter')

            return hasUnpairedHap || hasUnpairedMatter
          })

          if (this.$settings.env.plugins?.hideUpdatesFor?.includes(plugin.name)) {
            plugin.updateAvailable = false
          }
        } catch (error) {
          console.error(`Failed to load config for ${plugin.name}:`, error)

          // May not be technically correct, but if we can't load the config, assume it is configured
          plugin.isConfigured = true
          plugin.hasChildBridges = true
        }
      }),
    )
  }

  private getChildBridgeMetadata(): void {
    this.io.request('get-homebridge-child-bridge-status').subscribe((data) => {
      this.childBridges.set(data)
    })
  }

  /**
   * Check if a specific bridge protocol alert is hidden
   */
  private isBridgeAlertHidden(username: string, protocol: 'hap' | 'matter'): boolean {
    const bridge = this.$settings.env.bridges?.find(b => b.username.toUpperCase() === username.toUpperCase())
    if (!bridge) {
      return false
    }
    return protocol === 'hap' ? !!bridge.hideHapAlert : !!bridge.hideMatterAlert
  }
}
