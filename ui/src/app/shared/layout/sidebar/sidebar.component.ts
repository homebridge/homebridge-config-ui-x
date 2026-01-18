import { NgOptimizedImage } from '@angular/common'
import { Component, createEnvironmentInjector, DestroyRef, EnvironmentInjector, inject, input, OnDestroy, OnInit, Renderer2, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NavigationEnd, NavigationStart, Router, RouterLink, RouterLinkActive } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { isStandalonePWA } from 'is-standalone-pwa'
import { ToastrService } from 'ngx-toastr'

import { AuthHelperService } from '@/app/core/auth/auth-helper.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { NotificationService } from '@/app/core/communication/notification.service'
import { InformationComponent } from '@/app/core/components/information/information.component'
import { INFORMATION_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
  standalone: true,
  imports: [
    RouterLink,
    NgOptimizedImage,
    RouterLinkActive,
    TranslatePipe,
  ],
})
export class SidebarComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef)
  private injector = inject(EnvironmentInjector)
  private $auth = inject(AuthService)
  private $authHelper = inject(AuthHelperService)
  private $settings = inject(SettingsService)
  private $modal = inject(NgbModal)
  private $notification = inject(NotificationService)
  private $renderer = inject(Renderer2)
  private $router = inject(Router)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  initialIsExpanded = input<boolean>(false)

  public isExpanded = signal<boolean>(false)
  public formAuth = signal<boolean>(this.$settings.formAuth)
  public isAdmin = this.$auth.user.admin
  public enableTerminalAccess = this.$settings.env.enableTerminalAccess
  public rPiCurrentlyUnderVoltage = signal<boolean>(false)
  public rPiWasUnderVoltage = signal<boolean>(false)
  public legacyOtpToastShown = signal<boolean>(false)
  public isMobile = signal<boolean>(false)
  public freezeMenu = signal<boolean>(false)
  public isPwa = isStandalonePWA()

  // Store listener references for proper cleanup
  private sidebarMouseEnterListener = () => this.openSidebar()
  private sidebarMouseLeaveListener = () => this.closeSidebar()
  private touchstartListener: (e: MouseEvent) => void
  private clickListener: (e: MouseEvent) => void

  constructor() {
    this.isMobile.set(window.innerWidth < 768)
    let resizeTimeout: any
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        this.updateListeners()
      }, 500)
    })

    // Check authentication before navigation and ensure the menu closes when we navigate
    this.$router.events
      .pipe(takeUntilDestroyed())
      .subscribe(async (event) => {
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
          // Defer to avoid NG0100 error
          queueMicrotask(() => {
            this.closeSidebar()
            this.freezeMenu.set(true)
            setTimeout(() => {
              this.freezeMenu.set(false)
            }, 750)
          })
        }
      })
  }

  public ngOnInit() {
    this.isExpanded.set(this.initialIsExpanded())

    this.$notification
      .raspberryPiThrottled
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((throttled) => {
        if (throttled['Under Voltage']) {
          this.rPiCurrentlyUnderVoltage.set(true)
        }
        if (throttled['Under-voltage has occurred']) {
          this.rPiWasUnderVoltage.set(true)
        }
      })

    this.$notification
      .formAuthEnabled
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.formAuth.set(value)
      })

    this.$notification.legacyOtpDetected.subscribe((detected) => {
      // Only show toast if detected is true and we haven't shown it yet
      if (detected === true && !this.legacyOtpToastShown()) {
        this.legacyOtpToastShown.set(true)

        // Delay the toast by 5 seconds to avoid overwhelming the user on page load
        setTimeout(() => {
          const toast = this.$toastr.warning(
            this.$translate.instant('users.toast_legacy_otp_message'),
            this.$translate.instant('users.toast_legacy_otp_title'),
            {
              timeOut: 0,
              tapToDismiss: true,
              disableTimeOut: true,
            },
          )
          toast.onTap.subscribe(() => {
            void this.$router.navigate(['/users'])
          })
        }, 3000)
      }
    })

    // Declare element for event listeners
    const sidebar = document.querySelector('.sidebar')
    const mobileHeader = document.querySelector('.m-header')
    const content = document.querySelector('.content')

    if (this.isMobile()) {
      this.touchstartListener = (e: MouseEvent) => {
        if (content.contains(e.target as HTMLElement) && this.isExpanded()) {
          e.preventDefault()
          this.toggleSidebar()
          return
        }

        if (!sidebar.contains(e.target as HTMLElement) && !mobileHeader.contains(e.target as HTMLElement) && this.isExpanded()) {
          e.preventDefault()
          this.closeSidebar()
        }
      }
      document.addEventListener('touchstart', this.touchstartListener, { passive: false })
    } else {
      this.updateListeners()

      mobileHeader.addEventListener('mouseenter', this.sidebarMouseEnterListener, { passive: false })
      mobileHeader.addEventListener('mouseleave', this.sidebarMouseLeaveListener, { passive: false })

      this.clickListener = (e: MouseEvent) => {
        if (sidebar.contains(e.target as HTMLElement) && e.clientX > 60) {
          this.closeSidebar()
        }
      }
      document.addEventListener('click', this.clickListener, { passive: false })
    }
  }

  public toggleSidebar() {
    if (!this.freezeMenu()) {
      this.isExpanded.set(!this.isExpanded())
      this.updateContentStyles()
    }
  }

  public openUnderVoltageModal() {
    const injector = createEnvironmentInjector([{
      provide: INFORMATION_MODAL_DATA,
      useValue: {
        title: this.$translate.instant('rpi.throttled.undervoltage_title'),
        message: this.$translate.instant(this.rPiCurrentlyUnderVoltage()
          ? 'rpi.throttled.currently_message'
          : 'rpi.throttled.previously_message',
        ),
        ctaButtonLabel: this.$translate.instant('form.button_more_info'),
        faIconClass: 'fas fa-bolt yellow-text',
        ctaButtonLink: 'https://pimylifeup.com/raspberry-pi-low-voltage-warning',
      },
    }], this.injector)

    this.$modal.open(InformationComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })
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
    if (this.touchstartListener) {
      document.removeEventListener('touchstart', this.touchstartListener)
    }
    if (this.clickListener) {
      document.removeEventListener('click', this.clickListener)
    }

    const sidebar = document.querySelector('.sidebar')
    const mobileHeader = document.querySelector('.m-header')
    if (sidebar) {
      sidebar.removeEventListener('mouseenter', this.sidebarMouseEnterListener)
      sidebar.removeEventListener('mouseleave', this.sidebarMouseLeaveListener)
    }
    if (mobileHeader) {
      mobileHeader.removeEventListener('mouseenter', this.sidebarMouseEnterListener)
      mobileHeader.removeEventListener('mouseleave', this.sidebarMouseLeaveListener)
    }
  }

  public logout() {
    this.$auth.logout()
  }

  private openSidebar() {
    if (!this.freezeMenu()) {
      this.isExpanded.set(true)
      this.updateContentStyles()
    }
  }

  private closeSidebar() {
    if (!this.freezeMenu()) {
      this.isExpanded.set(false)
      this.updateContentStyles()
    }
  }

  private updateContentStyles() {
    const content = document.querySelector('.content')
    if (this.isExpanded()) {
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
    this.isMobile.set(window.innerWidth < 768)
    const sidebar = document.querySelector('.sidebar')

    // Remove existing listeners
    sidebar.removeEventListener('mouseenter', this.sidebarMouseEnterListener)
    sidebar.removeEventListener('mouseleave', this.sidebarMouseLeaveListener)

    // Add listeners based on mobile state and menu mode
    if (this.isMobile() || (!this.isMobile() && this.$settings.menuMode !== 'freeze')) {
      sidebar.addEventListener('mouseenter', this.sidebarMouseEnterListener, { passive: false })
      sidebar.addEventListener('mouseleave', this.sidebarMouseLeaveListener, { passive: false })
    }
  }
}
