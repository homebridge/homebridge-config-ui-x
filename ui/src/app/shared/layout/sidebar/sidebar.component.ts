import { NgClass, NgOptimizedImage } from '@angular/common'
import { Component, inject, Input, OnDestroy, OnInit, Renderer2 } from '@angular/core'
import { NavigationEnd, NavigationStart, Router, RouterLink, RouterLinkActive } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { isStandalonePWA } from 'is-standalone-pwa'

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

  // Store listener references for proper cleanup
  private sidebarMouseEnterListener = () => this.openSidebar()
  private sidebarMouseLeaveListener = () => this.closeSidebar()

  constructor() {
    this.isMobile = window.innerWidth < 768
    let resizeTimeout: any
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        this.updateListeners()
      }, 500)
    })

    // Check authentication before navigation and ensure the menu closes when we navigate
    this.$router.events.subscribe(async (event) => {
      if (event instanceof NavigationStart) {
        // Check if using form auth and if the token is expired
        if (this.$settings.formAuth && event.url !== '/login') {
          const isAuthenticated = await this.$authHelper.isAuthenticated()
          if (!isAuthenticated) {
            // Store the target route before redirecting
            window.sessionStorage.setItem('target_route', event.url)

            // Prevent the navigation and redirect to the login page
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

    // Declare element for event listeners
    const sidebar = document.querySelector('.sidebar')
    const mobileHeader = document.querySelector('.m-header')
    const content = document.querySelector('.content')

    if (this.isMobile) {
      document.addEventListener('touchstart', (e: MouseEvent) => {
        if (content.contains(e.target as HTMLElement) && this.isExpanded) {
          e.preventDefault()
          this.toggleSidebar()
          return
        }

        if (!sidebar.contains(e.target as HTMLElement) && !mobileHeader.contains(e.target as HTMLElement) && this.isExpanded) {
          e.preventDefault()
          this.closeSidebar()
        }
      }, { passive: false })
    } else {
      this.updateListeners()

      mobileHeader.addEventListener('mouseenter', this.sidebarMouseEnterListener, { passive: false })
      mobileHeader.addEventListener('mouseleave', this.sidebarMouseLeaveListener, { passive: false })

      document.addEventListener('click', (e: MouseEvent) => {
        if (sidebar.contains(e.target as HTMLElement) && e.clientX > 60) {
          this.closeSidebar()
        }
      }, { passive: false })
    }

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
    // Clean up event listeners
    document.removeEventListener('touchstart', () => {})
    document.removeEventListener('click', () => {})
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
    const content = document.querySelector('.content')
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

  private updateListeners() {
    this.isMobile = window.innerWidth < 768
    const sidebar = document.querySelector('.sidebar')

    // Remove existing listeners
    sidebar.removeEventListener('mouseenter', this.sidebarMouseEnterListener)
    sidebar.removeEventListener('mouseleave', this.sidebarMouseLeaveListener)

    // Add listeners based on mobile state and menu mode
    if (this.isMobile || (!this.isMobile && this.$settings.menuMode !== 'freeze')) {
      sidebar.addEventListener('mouseenter', this.sidebarMouseEnterListener, { passive: false })
      sidebar.addEventListener('mouseleave', this.sidebarMouseLeaveListener, { passive: false })
    }
  }
}
