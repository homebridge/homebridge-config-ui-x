import { HttpErrorResponse, HttpResponse } from '@angular/common/http'
import { Component, ElementRef, HostListener, inject, OnDestroy, OnInit, signal, viewChild } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms'
import { NgbModal, NgbTooltip } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr'
import { Observable, Subject, Subscription } from 'rxjs'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'

import { ApiService } from '@/app/core/api.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { LogService } from '@/app/core/log.service'
import { SettingsService } from '@/app/core/settings.service'

export interface CanComponentDeactivate {
  canDeactivate: (nextUrl?: string) => Observable<boolean> | Promise<boolean> | boolean
}

@Component({
  templateUrl: './logs.component.html',
  styleUrls: ['./logs.component.scss'],
  standalone: true,
  imports: [NgbTooltip, TranslatePipe, ReactiveFormsModule],
})
export class LogsComponent implements OnInit, OnDestroy, CanComponentDeactivate {
  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $log = inject(LogService)
  private $modal = inject(NgbModal)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  private readonly termTarget = viewChild<ElementRef>('logoutput')
  readonly searchInput = viewChild<ElementRef>('searchInput')

  private resizeEvent = new Subject<void>()
  private valueChangesSubscription?: Subscription

  public isAdmin = this.$auth.user.admin
  public showSearchBar = signal(false)
  public showExitButton = signal(false)
  public form = new FormGroup({
    query: new FormControl<string>(''),
  })

  // Helper to check if search input is invalid
  public get searchInputInvalid(): boolean {
    const query = (this.form.get('query')?.value || '').trim()
    return query.length > 0 && query.length < 3
  }

  @HostListener('window:resize', ['$event'])
  onWindowResize() {
    this.resizeEvent.next(undefined)
  }

  public ngOnInit() {
    // Set page title
    const title = this.$translate.instant('menu.linux.label_logs')
    this.$settings.setPageTitle(title)

    // Set body bg color
    window.document.querySelector('body').classList.add('bg-black')

    // Add light-mode class for animations (only in light mode)
    if (this.$settings.actualLightingMode === 'light') {
      window.document.querySelector('body').classList.add('light-mode')
      const terminal = this.termTarget()?.nativeElement
      if (terminal) {
        terminal.classList.add('light-mode')
      }
    }

    // Start the terminal
    this.$log.startTerminal(this.termTarget(), {
      allowProposedApi: true,
    }, this.resizeEvent)

    // Watch for changes in the search query
    this.valueChangesSubscription = this.form.get('query')?.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged(),
    ).subscribe((value) => {
      const query = value || ''

      // Trim whitespace from the beginning and end
      const trimmed = query.trim()
      if (trimmed !== query) {
        // Update the form value without emitting another event to avoid infinite loop
        this.form.get('query')?.setValue(trimmed, { emitEvent: false })
      }

      // Auto-search when query is 3 or more characters
      if (trimmed.length >= 3) {
        this.showExitButton.set(true)
        this.$log.setSearchFilter(trimmed)
        this.$log.scrollToBottom()
      } else if (trimmed.length < 3 && this.showExitButton()) {
        // Clear the search only if it was previously active
        this.showExitButton.set(false)
        this.$log.clearSearchFilter()
        this.$log.scrollToBottom()
      }
    })
  }

  public showSearch(): void {
    if (this.showSearchBar()) {
      this.showSearchBar.set(false)
      this.showExitButton.set(false)
      this.form.setValue({ query: '' })
      this.$log.clearSearchFilter()
    } else {
      this.showSearchBar.set(true)
      const input = this.searchInput()
      if (input) {
        setTimeout(() => input.nativeElement.focus(), 10)
      }
    }
    setTimeout(() => this.resizeEvent.next(undefined), 10)
    this.$log.scrollToBottom()
  }

  public onSubmit(formValue: Partial<{ query: string | null }>): void {
    const trimmedQuery = (formValue.query || '').trim()

    // Require at least 3 characters for search
    if (!trimmedQuery.length || trimmedQuery.length < 3) {
      // If the query is empty, treat this as the user wanting to close the search
      if (!trimmedQuery.length) {
        this.showSearchBar.set(false)
      }
      // Clear the search box and show all logs when enter is pressed with invalid input
      this.form.setValue({ query: '' })
      this.showExitButton.set(false)
      this.$log.clearSearchFilter()
    } else {
      this.showExitButton.set(true)
      this.$log.setSearchFilter(trimmedQuery)
    }
    this.$log.scrollToBottom()
  }

  public onClearSearch(): void {
    this.form.setValue({ query: '' })
    this.showExitButton.set(false)
    this.$log.clearSearchFilter()
    this.$log.scrollToBottom()
  }

  public canDeactivate(nextUrl?: string): Promise<boolean> {
    // If in dark mode, no animations needed - navigate immediately
    if (this.$settings.actualLightingMode !== 'light') {
      window.document.querySelector('body').classList.remove('bg-black')
      return Promise.resolve(true)
    }

    // Hide search bar immediately to avoid seeing black search bar on white background
    if (this.showSearchBar()) {
      this.showSearchBar.set(false)
    }

    // Remove light-mode class from body
    window.document.querySelector('body').classList.remove('light-mode')

    return new Promise((resolve) => {
      // Check if we're navigating to another black-background page
      const stayingBlack = nextUrl && (
        nextUrl.includes('/platform-tools/terminal')
        || nextUrl.includes('/logs')
      )

      // Add fade-out class to terminal
      const terminal = this.termTarget()?.nativeElement
      if (terminal) {
        terminal.classList.add('fade-out')
      }

      if (stayingBlack) {
        // Just fade out the terminal, keep background black
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

    // Unsubscribe from form changes
    if (this.valueChangesSubscription) {
      this.valueChangesSubscription.unsubscribe()
    }

    // Complete resize subject
    this.resizeEvent.complete()

    // Destroy the terminal
    this.$log.destroyTerminal()
  }

  public downloadLogFile(): void {
    const ref = this.$modal.open(ConfirmComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.title = this.$translate.instant('logs.title_download_log_file')
    ref.componentInstance.message = this.$translate.instant('logs.download_warning')
    ref.componentInstance.confirmButtonLabel = this.$translate.instant('form.button_download')
    ref.componentInstance.faIconClass = 'fas fa-user-secret primary-text'

    ref.result
      .then(() => {
        this.$api.get('/platform-tools/hb-service/log/download', { observe: 'response', responseType: 'blob' }).subscribe({
          next: (res: HttpResponse<any>) => {
            saveAs(res.body, 'homebridge.log.txt')
          },
          error: async (err: HttpErrorResponse) => {
            let message: string
            try {
              message = JSON.parse(await err.error.text()).message
            } catch (error) {
              console.error(error)
            }
            this.$toastr.error(message || this.$translate.instant('logs.download.error'), this.$translate.instant('toast.title_error'))
          },
        })
      })
      .catch(() => { /* do nothing */ })
  }

  public truncateLogFile(): void {
    const ref = this.$modal.open(ConfirmComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.title = this.$translate.instant('logs.title_truncate_log_file')
    ref.componentInstance.message = this.$translate.instant('logs.truncate_log_warning')
    ref.componentInstance.confirmButtonLabel = this.$translate.instant('form.button_delete')
    ref.componentInstance.confirmButtonClass = 'btn-danger'
    ref.componentInstance.faIconClass = 'fas fa-circle-exclamation primary-text'

    ref.result
      .then(() => {
        this.$api.put('/platform-tools/hb-service/log/truncate', {}).subscribe({
          next: () => {
            this.$toastr.success(
              this.$translate.instant('logs.log_file_truncated'),
              this.$translate.instant('toast.title_success'),
            )
            this.$log.term.clear()
          },
          error: (error: HttpErrorResponse) => {
            console.error(error)
            this.$toastr.error(error.error?.message || this.$translate.instant('logs.truncate.error'), this.$translate.instant('toast.title_error'))
          },
        })
      })
      .catch(() => { /* do nothing */ })
  }
}
