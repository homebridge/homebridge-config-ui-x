import { NgClass, NgOptimizedImage } from '@angular/common'
import { Component, inject, Input, OnDestroy, OnInit, Renderer2 } from '@angular/core'
import { NavigationEnd, NavigationStart, Router, RouterLink, RouterLinkActive } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { isStandalonePWA } from 'is-standalone-pwa'
import { Subscription } from 'rxjs'

import { AuthHelperService } from '@/app/core/auth/auth-helper.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { InformationComponent } from '@/app/core/components/information/information.component'
import { NotificationService } from '@/app/core/notification.service'
import { SettingsService } from '@/app/core/settings.service'

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
  standalone: true,
  imports: [
    RouterLink,
    NgOptimizedImage,
    NgClass,
    RouterLinkActive,
    TranslatePipe,
  ],
})
export class SidebarComponent implements OnInit, OnDestroy {
  private $auth = inject(AuthService)
  private $authHelper = inject(AuthHelperService)
  private $settings = inject(SettingsService)
  private $modal = inject(NgbModal)
  private $notification = inject(NotificationService)
  private $renderer = inject(Renderer2)
  private $router = inject(Router)
  private $translate = inject(TranslateService)

  @Input() isExpanded = false

  public formAuth = this.$settings.formAuth
  public isAdmin = this.$auth.user.admin
  public enableTerminalAccess = this.$settings.env.enableTerminalAccess
  public rPiCurrentlyUnderVoltage = false
  public rPiWasUnderVoltage = false
  public isMobile: any = false
  public freezeMenu = false
  public isPwa = isStandalonePWA()

  private sidebarMouseEnterListener = () => this.openSidebar()
  private sidebarMouseLeaveListener = () => this.closeSidebar()

  private resizeTimeout: any
  private routerSub?: Subscription

  private sidebarEl: HTMLElement | null = null
  private mobileHeaderEl: HTMLElement | null = null
  private contentEl: HTMLElement | null = null

  private onWindowResize = () => {
    clearTimeout(this.resizeTimeout)
    this.resizeTimeout = setTimeout(() => {
      this.cacheElements()
      this.updateListeners()
    }, 500)
  }

  private onDocumentTouchStart = (e: Event) => {
    const sidebar = this.sidebarEl
    const mobileHeader = this.mobileHeaderEl
    const content = this.contentEl
    const target = e.target as HTMLElement | null

    if (!target) {
      return
    }

    if (content && content.contains(target) && this.isExpanded) {
      e.preventDefault()
      this.toggleSidebar()
      return
    }

    if (
      sidebar
      && mobileHeader
      && !sidebar.contains(target)
      && !mobileHeader.contains(target)
      && this.isExpanded
    ) {
      e.preventDefault()
      this.closeSidebar()
    }
  }

  private onDocumentClick = (e: MouseEvent) => {
    const sidebar = this.sidebarEl
    const target = e.target as HTMLElement | null
    if (!sidebar || !target) {
      return
    }

    if (sidebar.contains(target) && e.clientX > 60) {
      this.closeSidebar()
    }
  }

  constructor() {
    this.isMobile = window.innerWidth < 768
    window.addEventListener('resize', this.onWindowResize)

    this.routerSub = this.$router.events.subscribe(async (event) => {
      if (event instanceof NavigationStart) {
        if (this.$settings.formAuth && event.url !== '/login') {
          const isAuthenticated = await this.$authHelper.isAuthenticated()
          if (!isAuthenticated) {
            window.sessionStorage.setItem('target_route', event.url)
            await this.$router.navigate(['/login'])
            return
          }
        }
      }

      if (event instanceof NavigationEnd) {
        this.closeSidebar()
        this.freezeMenu = true
        setTimeout(() => {
          this.freezeMenu = false
        }, 750)
      }
    })
  }

  public ngOnInit() {
    this.$notification.raspberryPiThrottled.subscribe((throttled) => {
      if (throttled['Under Voltage']) {
        this.rPiCurrentlyUnderVoltage = true
      }
      if (throttled['Under-voltage has occurred']) {
        this.rPiWasUnderVoltage = true
      }
    })

    this.$notification.formAuthEnabled.subscribe((value) => {
      this.formAuth = value
    })

    this.cacheElements()
    this.updateListeners()
    this.updateContentStyles()
  }

  public toggleSidebar() {
    if (!this.freezeMenu) {
      this.isExpanded = !this.isExpanded
      this.updateContentStyles()
    }
  }

  public openUnderVoltageModal() {
    const ref = this.$modal.open(InformationComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.title = this.$translate.instant('rpi.throttled.undervoltage_title')
    ref.componentInstance.message = this.$translate.instant(this.rPiCurrentlyUnderVoltage
      ? 'rpi.throttled.currently_message'
      : 'rpi.throttled.previously_message',
    )
    ref.componentInstance.ctaButtonLabel = this.$translate.instant('form.button_more_info')
    ref.componentInstance.faIconClass = 'fas fa-bolt yellow-text'
    ref.componentInstance.ctaButtonLink = 'https://pimylifeup.com/raspberry-pi-low-voltage-warning'
  }

  public handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      const target = event.target as HTMLElement
      if (['menuitem', 'button'].includes(target.getAttribute('role'))) {
        target.click()
      }
    }
  }

  public reloadPage() {
    window.location.reload()
  }

  public ngOnDestroy() {
    window.removeEventListener('resize', this.onWindowResize)
    clearTimeout(this.resizeTimeout)

    this.routerSub?.unsubscribe()

    document.removeEventListener('touchstart', this.onDocumentTouchStart as any)
    document.removeEventListener('click', this.onDocumentClick as any)

    this.removeHoverListeners(this.sidebarEl)
    this.removeHoverListeners(this.mobileHeaderEl)

    this.sidebarEl = null
    this.mobileHeaderEl = null
    this.contentEl = null
  }

  public logout() {
    this.$auth.logout()
  }

  private openSidebar() {
    if (!this.freezeMenu) {
      this.isExpanded = true
      this.updateContentStyles()
    }
  }

  private closeSidebar() {
    if (!this.freezeMenu) {
      this.isExpanded = false
      this.updateContentStyles()
    }
  }

  private updateContentStyles() {
    if (!this.contentEl) {
      this.cacheElements()
    }

    const content = this.contentEl
    if (!content) {
      return
    }

    if (this.isExpanded) {
      this.$renderer.setStyle(content, 'opacity', '20%')
      this.$renderer.setStyle(content, 'pointer-events', 'none')
      this.$renderer.setStyle(content, 'overflow', 'hidden')
    } else {
      this.$renderer.removeStyle(content, 'opacity')
      this.$renderer.removeStyle(content, 'pointer-events')
      this.$renderer.removeStyle(content, 'overflow')
    }
  }

  private cacheElements() {
    this.sidebarEl = document.querySelector('.sidebar') as HTMLElement | null
    this.mobileHeaderEl = document.querySelector('.m-header') as HTMLElement | null
    this.contentEl = document.querySelector('.content') as HTMLElement | null
  }

  private addHoverListeners(el: HTMLElement | null) {
    if (!el) {
      return
    }
    el.addEventListener('mouseenter', this.sidebarMouseEnterListener, { passive: false })
    el.addEventListener('mouseleave', this.sidebarMouseLeaveListener, { passive: false })
  }

  private removeHoverListeners(el: HTMLElement | null) {
    if (!el) {
      return
    }
    el.removeEventListener('mouseenter', this.sidebarMouseEnterListener)
    el.removeEventListener('mouseleave', this.sidebarMouseLeaveListener)
  }

  private updateListeners() {
    this.isMobile = window.innerWidth < 768

    this.removeHoverListeners(this.sidebarEl)
    this.removeHoverListeners(this.mobileHeaderEl)

    document.removeEventListener('touchstart', this.onDocumentTouchStart as any)
    document.removeEventListener('click', this.onDocumentClick as any)

    if (this.isMobile) {
      document.addEventListener('touchstart', this.onDocumentTouchStart as any, { passive: false })
      return
    }

    if (!this.isMobile && this.$settings.menuMode !== 'freeze') {
      this.addHoverListeners(this.sidebarEl)
      this.addHoverListeners(this.mobileHeaderEl)
    }

    document.addEventListener('click', this.onDocumentClick as any, { passive: false })
  }
}
