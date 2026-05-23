import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, inject, input, OnDestroy, OnInit, signal, viewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { TranslatePipe } from '@ngx-translate/core'
import { ITerminalOptions } from '@xterm/xterm'
import { Subject } from 'rxjs'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'

import { AuthService } from '@/app/core/auth/auth.service'
import { SettingsService } from '@/app/core/ui/settings.service'
import { LogService } from '@/app/core/utilities/log.service'
import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  selector: 'app-homebridge-logs-widget',
  imports: [
    NgbTooltip,
    ReactiveFormsModule,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './homebridge-logs-widget.component.html',
  styleUrl: './homebridge-logs-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomebridgeLogsWidgetComponent implements OnInit, OnDestroy {
  // Injected dependencies
  private destroyRef = inject(DestroyRef)
  private $auth = inject(AuthService)
  private $log = inject(LogService)
  private $settings = inject(SettingsService)
  private $cdr = inject(ChangeDetectorRef)

  // Signals
  readonly widget = input.required<Widget>()
  readonly widgetContainerElement = viewChild<ElementRef>('widgetcontainer')
  readonly titleElement = viewChild<ElementRef>('terminaltitle')
  readonly searchContainerElement = viewChild<ElementRef>('searchcontainer')
  readonly searchInput = viewChild<ElementRef>('searchInput')
  readonly termTarget = viewChild<ElementRef>('logoutput')
  public readonly terminalHeight = signal<number>(200)
  public readonly theme = signal<'dark' | 'light'>('dark')
  public readonly showSearchBar = signal(false)
  public readonly showExitButton = signal(false)

  // Other properties
  public isAdmin = this.$auth.user.admin
  public form = new FormGroup({
    query: new FormControl<string>(''),
  })

  private initialized = false
  resizeEvent!: Subject<void> // Set directly by ComponentFactoryResolver
  configureEvent!: Subject<void> // Set directly by ComponentFactoryResolver

  public get searchInputInvalid(): boolean {
    const query = (this.form.get('query')?.value || '').trim()
    return query.length > 0 && query.length < 3
  }

  public ngOnInit(): void {
    // Use effective theme to enforce dark mode override when needed
    this.theme.set(this.$settings.getEffectiveTerminalLightingMode())
    setTimeout(() => {
      // Use global terminal settings from settings service
      this.$log.startTerminal(this.termTarget()!, this.$settings.getTerminalOptions({
        cursorBlink: false,
      }, true), this.resizeEvent)

      // Mark as initialized after terminal setup completes
      this.initialized = true

      // Trigger initial resize to calculate height and fit terminal
      setTimeout(() => {
        this.resizeEvent.next()
      }, 100)
    })

    this.resizeEvent.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      // Skip resize updates until component is fully initialized
      if (!this.initialized) {
        return
      }
      this.terminalHeight.set(this.getTerminalHeight())
    })

    // Note: Widget-specific configuration (fontSize, fontWeight, theme) is not implemented
    // Only global terminal settings via terminalSettingsSubscription are functional
    this.configureEvent.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      // Reserved for future widget-specific configuration if needed
    })

    // Watch for changes in the search query (auto-search after 500ms debounce)
    this.form.get('query')?.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((value) => {
      const query = value || ''
      const trimmed = query.trim()
      if (trimmed !== query) {
        // Update the form value without emitting another event to avoid infinite loop
        this.form.get('query')?.setValue(trimmed, { emitEvent: false })
      }
      if (trimmed.length >= 3) {
        this.showExitButton.set(true)
        this.$log.setSearchFilter(trimmed)
        this.$log.scrollToBottom()
      } else if (trimmed.length < 3 && this.showExitButton()) {
        this.showExitButton.set(false)
        this.$log.clearSearchFilter()
        this.$log.scrollToBottom()
      }
    })

    // Subscribe to global terminal settings changes
    this.$settings.terminalSettingsChanged.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (settings) => {
        if (!this.$log.term) {
          return
        }
        let changed = false
        if (settings.fontSize && this.$log.term.options.fontSize !== settings.fontSize) {
          this.$log.term.options.fontSize = settings.fontSize
          changed = true
        }
        if (settings.fontWeight && this.$log.term.options.fontWeight !== settings.fontWeight) {
          this.$log.term.options.fontWeight = settings.fontWeight as ITerminalOptions['fontWeight']
          changed = true
        }
        if (settings.lightingMode !== undefined) {
          const themeOptions = this.$settings.getTerminalThemeOptions(true)
          this.$log.term.options.theme = themeOptions.theme
          this.$log.term.options.allowTransparency = themeOptions.allowTransparency
          changed = true

          // Trigger change detection for template bindings (background color, etc.)
          this.$cdr.markForCheck()
        }
        if (changed) {
          this.resizeEvent.next(undefined)
          setTimeout(() => {
            this.$log.term.scrollToBottom()
          }, 100)
        }
      },
    })
  }

  public ngOnDestroy(): void {
    // Clear any active search filter so it doesn't bleed into the Logs page
    if (this.showExitButton()) {
      this.$log.clearSearchFilter()
    }
    this.$log.destroyTerminal()
  }

  public showSearch(): void {
    if (this.showSearchBar()) {
      this.showSearchBar.set(false)
      this.showExitButton.set(false)
      this.form.setValue({ query: '' })
      this.$log.clearSearchFilter()
    } else {
      this.showSearchBar.set(true)
      setTimeout(() => this.searchInput()?.nativeElement.focus(), 10)
    }
    setTimeout(() => this.resizeEvent.next(undefined), 10)
    this.$log.scrollToBottom()
  }

  public onSubmit(formValue: Partial<{ query: string | null }>): void {
    const trimmedQuery = (formValue.query || '').trim()
    if (!trimmedQuery.length || trimmedQuery.length < 3) {
      if (!trimmedQuery.length) {
        this.showSearchBar.set(false)
        setTimeout(() => this.resizeEvent.next(undefined), 10)
      }
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

  public downloadLogFile(): Promise<void> {
    return this.$log.downloadLogFile()
  }

  public truncateLogFile(): Promise<void> {
    return this.$log.truncateLogFile()
  }

  private getTerminalHeight(): number {
    const widgetContainerHeight = (this.widgetContainerElement()!.nativeElement as HTMLElement).offsetHeight
    const titleHeight = (this.titleElement()!.nativeElement as HTMLElement).offsetHeight
    const searchHeight = (this.searchContainerElement()?.nativeElement as HTMLElement | undefined)?.offsetHeight ?? 0
    return widgetContainerHeight - titleHeight - searchHeight
  }
}
