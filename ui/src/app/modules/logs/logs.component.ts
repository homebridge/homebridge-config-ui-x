import { HttpResponse } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, createEnvironmentInjector, DestroyRef, ElementRef, EnvironmentInjector, inject, OnDestroy, OnInit, signal, viewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr'
import { Observable, Subject } from 'rxjs'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'

import { AuthService } from '@/app/core/auth/auth.service'
import { ApiService } from '@/app/core/communication/api.service'
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { CONFIRM_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { SettingsService } from '@/app/core/ui/settings.service'
import { LogService } from '@/app/core/utilities/log.service'

export interface CanComponentDeactivate {
  canDeactivate: (nextUrl?: string) => Observable<boolean> | Promise<boolean> | boolean
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './logs.component.html',
  styleUrl: './logs.component.scss',
  standalone: true,
  imports: [NgbTooltip, TranslatePipe, ReactiveFormsModule],
  host: {
    '(window:resize)': 'onWindowResize()',
  },
})
export class LogsComponent implements OnInit, OnDestroy, CanComponentDeactivate {
  private destroyRef = inject(DestroyRef)
  private injector = inject(EnvironmentInjector)
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

  public isAdmin = this.$auth.user.admin
  public showSearchBar = signal(false)
  public showExitButton = signal(false)
  public terminalTheme: 'light' | 'dark' = 'dark'
  public form = new FormGroup({
    query: new FormControl<string>(''),
  })

  // Helper to check if search input is invalid
  public get searchInputInvalid(): boolean {
    const query = (this.form.get('query')?.value || '').trim()
    return query.length > 0 && query.length < 3
  }

  onWindowResize() {
    this.resizeEvent.next(undefined)
  }

  public ngOnInit() {
    // Set page title
    const title = this.$translate.instant('menu.linux.label_logs')
    this.$settings.setPageTitle(title)

    // Get terminal theme (light or dark) - enforces dark mode override
    this.terminalTheme = this.$settings.getEffectiveTerminalLightingMode()

    // Set body bg color based on terminal theme
    if (this.terminalTheme === 'dark') {
      window.document.querySelector('body').classList.add('bg-black')
    } else {
      window.document.querySelector('body').classList.add('bg-white')
    }

    // Add transition class only when main theme is light AND terminal theme is dark
    // This creates smooth transitions when light mode users navigate to dark terminal pages
    const needsTransition = (
      this.$settings.actualLightingMode === 'light'
      && this.terminalTheme === 'dark'
    )

    if (needsTransition) {
      window.document.querySelector('body').classList.add('theme-transition')
      const terminal = this.termTarget()?.nativeElement
      if (terminal) {
        terminal.classList.add('theme-transition')
      }
    }

    // Start the terminal
    this.$log.startTerminal(this.termTarget(), this.$settings.getTerminalOptions(), this.resizeEvent)

    // Watch for changes in the search query
    this.form.get('query')?.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef),
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
    // Get terminal theme - enforces dark mode override
    const terminalTheme = this.$settings.getEffectiveTerminalLightingMode()

    // Check if transition is needed (only when main theme is light AND terminal theme is dark)
    const needsTransition = (
      this.$settings.actualLightingMode === 'light'
      && terminalTheme === 'dark'
    )

    // If no transition needed, navigate immediately
    if (!needsTransition) {
      window.document.querySelector('body').classList.remove('bg-black')
      window.document.querySelector('body').classList.remove('bg-white')
      return Promise.resolve(true)
    }

    // Hide search bar immediately to avoid background color mismatch
    if (this.showSearchBar()) {
      this.showSearchBar.set(false)
    }

    // Remove theme-transition class from body
    window.document.querySelector('body').classList.remove('theme-transition')

    return new Promise((resolve) => {
      // Check if we're navigating to another page with the same terminal theme
      const stayingSameTheme = nextUrl && (
        nextUrl.includes('/platform-tools/terminal')
        || nextUrl.includes('/logs')
      )

      // Add fade-out class to terminal
      const terminal = this.termTarget()?.nativeElement
      if (terminal) {
        terminal.classList.add('fade-out')
      }

      if (stayingSameTheme) {
        // Just fade out the terminal, keep background the same
        setTimeout(() => {
          resolve(true)
        }, 250)
      } else {
        // Wait for fade-out animation (250ms) and body background transition (250ms)
        setTimeout(() => {
          // Remove body bg color to trigger background transition
          window.document.querySelector('body').classList.remove('bg-black')
          window.document.querySelector('body').classList.remove('bg-white')
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

    // Complete resize subject
    this.resizeEvent.complete()

    // Destroy the terminal
    this.$log.destroyTerminal()
  }

  public async downloadLogFile(): Promise<void> {
    const injector = createEnvironmentInjector([{
      provide: CONFIRM_MODAL_DATA,
      useValue: {
        title: this.$translate.instant('logs.title_download_log_file'),
        message: this.$translate.instant('logs.download_warning'),
        confirmButtonLabel: this.$translate.instant('form.button_download'),
        faIconClass: 'fas fa-user-secret primary-text',
      },
    }], this.injector)

    const ref = this.$modal.open(ConfirmComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      await ref.result
      try {
        const res = await this.$api.get('/platform-tools/hb-service/log/download', { observe: 'response', responseType: 'blob' }) as HttpResponse<Blob>

        // If search is active, filter the log content
        const searchFilter = this.$log.getSearchFilter()
        if (searchFilter) {
          const logText = await res.body.text()
          const filteredLines = logText.split('\n').filter((line: string) => {
            // eslint-disable-next-line no-control-regex, unicorn/escape-case
            const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '').toLowerCase()
            return cleanLine.includes(searchFilter.toLowerCase())
          })
          const filteredBlob = new Blob([filteredLines.join('\n')], { type: 'text/plain' })
          saveAs(filteredBlob, 'homebridge.log.txt')
        } else {
          saveAs(res.body, 'homebridge.log.txt')
        }
      } catch (err) {
        let message: string | undefined
        try {
          if (err && typeof err === 'object' && 'error' in err) {
            const errorText = await (err as { error: Blob }).error.text()
            message = JSON.parse(errorText).message
          }
        } catch (error) {
          console.error(error)
        }
        this.$toastr.error(message || this.$translate.instant('logs.download.error'), this.$translate.instant('toast.title_error'))
      }
    } catch {
      // Modal dismissed, do nothing
    }
  }

  public async truncateLogFile(): Promise<void> {
    const injector = createEnvironmentInjector([{
      provide: CONFIRM_MODAL_DATA,
      useValue: {
        title: this.$translate.instant('logs.title_truncate_log_file'),
        message: this.$translate.instant('logs.truncate_log_warning'),
        confirmButtonLabel: this.$translate.instant('form.button_delete'),
        confirmButtonClass: 'btn-danger',
        faIconClass: 'fas fa-circle-exclamation primary-text',
      },
    }], this.injector)

    const ref = this.$modal.open(ConfirmComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      await ref.result
      try {
        await this.$api.put('/platform-tools/hb-service/log/truncate', {})
        this.$toastr.success(
          this.$translate.instant('logs.log_file_truncated'),
          this.$translate.instant('toast.title_success'),
        )
        this.$log.term.clear()
      } catch (error) {
        console.error(error)
        const message = (error && typeof error === 'object' && 'error' in error && error.error && typeof error.error === 'object' && 'message' in error.error)
          ? String(error.error.message)
          : this.$translate.instant('logs.truncate.error')
        this.$toastr.error(message, this.$translate.instant('toast.title_error'))
      }
    } catch {
      // Modal dismissed, do nothing
    }
  }
}
