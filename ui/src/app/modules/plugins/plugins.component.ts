import { NgClass } from '@angular/common'
import { Component, ElementRef, inject, OnDestroy, OnInit, ViewChild } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NavigationEnd, Router } from '@angular/router'
import { NgbModal, NgbTooltip } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom, Observable, Subscription } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { SpinnerComponent } from '@/app/core/components/spinner/spinner.component'
import { Plugin } from '@/app/core/manage-plugins/manage-plugins.interfaces'
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service'
import { SettingsService } from '@/app/core/settings.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'
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
    NgClass,
    NgbTooltip,
  ],
})
export class PluginsComponent implements OnInit, OnDestroy, CanComponentDeactivate {
  @ViewChild('searchInput') searchInput!: ElementRef

  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $modal = inject(NgbModal)
  private $plugin = inject(ManagePluginsService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private isSearchMode = false
  private io: IoNamespace
  private navigationSubscription: Subscription
  private pluginRefreshSubscription: Subscription

  public mainError = false
  public loading = true
  public tab: 'main' | 'stats' = 'main'
  public installedPlugins: Plugin[] = []
  public childBridges = []
  public showSearchBar = false
  public showExitButton = false
  public isAdmin = this.$auth.user.admin
  public form = new FormGroup({
    query: new FormControl(''),
  })

  public async ngOnInit() {
    // Set page title
    const title = this.$translate.instant('menu.label_plugins')
    this.$settings.setPageTitle(title)

    // Subscribe to plugin list refresh events
    this.pluginRefreshSubscription = this.$plugin.onPluginListRefresh.subscribe(async () => {
      await this.loadInstalledPlugins()
      this.getChildBridgeMetadata()
    })

    this.io = this.$ws.connectToNamespace('child-bridges')
    this.io.connected.subscribe(async () => {
      this.getChildBridgeMetadata()
      this.io.socket.emit('monitor-child-bridge-status')

      // Load list of installed plugins
      await this.loadInstalledPlugins()

      if (!this.installedPlugins.length) {
        this.showSearch()
      }

      // Get any query parameters
      const { action: queryAction, plugin: queryPlugin } = this.$router.parseUrl(this.$router.url).queryParams
      if (queryAction) {
        const plugin: Plugin = this.installedPlugins.find(x => x.name === queryPlugin)
        switch (queryAction) {
          case 'just-installed': {
            if (plugin) {
              if (plugin.isConfigured) {
                this.$modal.open(RestartHomebridgeComponent, {
                  size: 'lg',
                  backdrop: 'static',
                })
              } else {
                this.$plugin.settings(plugin)
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
    })

    this.io.socket.on('child-bridge-status-update', (data) => {
      const existingBridge = this.childBridges.find(x => x.username === data.username)
      if (existingBridge) {
        Object.assign(existingBridge, data)
      } else {
        this.childBridges.push(data)
      }
    })

    this.navigationSubscription = this.$router.events.subscribe((e: any) => {
      // If it is a NavigationEnd event re-initialise the component
      if (e instanceof NavigationEnd) {
        this.loadInstalledPlugins()
      }
    })
  }

  public search() {
    this.installedPlugins = []
    this.loading = true
    this.showExitButton = true

    this.$api.get(`/plugins/search/${encodeURIComponent(this.form.value.query)}`).subscribe({
      next: (data) => {
        // Some filtering in regard to the changeover to scoped plugins
        // A plugin may have two versions, like homebridge-foo and @homebridge-plugins/homebridge-foo
        // If the user does not have either installed, or has the scoped version installed, then hide the unscoped version
        // If the user has the unscoped version installed, but not the scoped version, then hide the scoped version
        const hiddenPlugins = new Set<string>()
        const pluginMap = new Map(data.map((plugin: Plugin) => [plugin.name, plugin]))
        this.installedPlugins = data
          .reduce((acc: any, x: Plugin) => {
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
          }, [])
        this.appendMetaInfo()
        this.loading = false
      },
      error: (error) => {
        this.loading = false
        this.isSearchMode = false
        console.error(error)
        this.$toastr.error(error.error?.message || error.message, this.$translate.instant('toast.title_error'))
        this.loadInstalledPlugins()
      },
    })
  }

  public onClearSearch() {
    this.loadInstalledPlugins()
  }

  public onSubmit({ value }) {
    if (!value.query.length) {
      if (this.isSearchMode) {
        this.isSearchMode = false
        this.loadInstalledPlugins()
      }
    } else {
      this.isSearchMode = true
      this.search()
    }
  }

  public showSearch() {
    if (this.showSearchBar) {
      this.showSearchBar = false
      if (this.isSearchMode) {
        this.isSearchMode = false
        this.form.setValue({ query: '' })
        this.loadInstalledPlugins()
      }
    } else {
      window.document.querySelector('body').classList.remove('bg-black')
      this.tab = 'main'
      this.showSearchBar = true
      setTimeout(() => this.searchInput.nativeElement.focus(), 0)
    }
  }

  public showStats() {
    if (this.tab === 'stats') {
      // In dark mode, no animations needed
      if (this.$settings.actualLightingMode !== 'light') {
        window.document.querySelector('body').classList.remove('bg-black')
        this.tab = 'main'
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
          this.tab = 'main'
        }, 250)
      }, 250)
    } else {
      // Set body bg color
      window.document.querySelector('body').classList.add('bg-black')
      this.tab = 'stats'
      this.showSearchBar = false

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

  public openSupport() {
    this.$modal.open(PluginSupportComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  public canDeactivate(nextUrl?: string): Promise<boolean> | boolean {
    // Only animate if we're on the stats tab
    if (this.tab !== 'stats') {
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

    if (this.navigationSubscription) {
      this.navigationSubscription.unsubscribe()
    }
    if (this.pluginRefreshSubscription) {
      this.pluginRefreshSubscription.unsubscribe()
    }
    this.io.end()
  }

  public getPluginChildBridges(plugin: Plugin) {
    return this.childBridges.filter(x => x.plugin === plugin.name)
  }

  private async loadInstalledPlugins() {
    this.form.setValue({ query: '' })
    this.showExitButton = false
    this.installedPlugins = []
    this.loading = true
    this.mainError = false

    try {
      const installedPlugins = await firstValueFrom(this.$api.get('/plugins'))
      this.installedPlugins = installedPlugins.filter((x: Plugin) => x.name !== 'homebridge-config-ui-x')
      await this.appendMetaInfo()

      // Multi-criteria sorting
      const sortedList = this.installedPlugins.sort((a, b) => {
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

      this.loading = false
      return sortedList
    } catch (error) {
      console.error(error)
      this.loading = false
      this.mainError = true
      this.$toastr.error(this.$translate.instant('plugins.toast_failed_to_load_plugins'), this.$translate.instant('toast.title_error'))
    }
  }

  private async appendMetaInfo() {
    if (this.isAdmin) {
      // Also get the current configuration for each plugin
      await Promise.all(this.installedPlugins
        .filter(plugin => plugin.installedVersion)
        .map(async (plugin: Plugin) => {
          try {
            // Adds some extra properties to the plugin object for the plugin card
            const configBlocks = await firstValueFrom(this.$api.get(`/config-editor/plugin/${encodeURIComponent(plugin.name)}`))
            plugin.isConfigured = configBlocks.length > 0
            plugin.isConfiguredDynamicPlatform = plugin.isConfigured && Object.prototype.hasOwnProperty.call(configBlocks[0], 'platform')

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
          } catch (err) {
            // May not be technically correct, but if we can't load the config, assume it is configured
            plugin.isConfigured = true
            plugin.hasChildBridges = true
          }
        }),
      )
    }
  }

  private getChildBridgeMetadata() {
    this.io.request('get-homebridge-child-bridge-status').subscribe((data) => {
      this.childBridges = data
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
