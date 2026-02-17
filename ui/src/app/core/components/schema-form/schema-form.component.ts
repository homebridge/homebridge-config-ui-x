import { ChangeDetectionStrategy, Component, effect, inject, input, OnDestroy, OnInit, output, signal } from '@angular/core'
import { JsonSchemaFormModule } from '@ng-formworks/core'

import { JsonSchemaFormPatchDirective } from '@/app/core/directives/json-schema-form-patch.directive'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-schema-form',
  templateUrl: './schema-form.component.html',
  standalone: true,
  imports: [
    JsonSchemaFormModule,
    JsonSchemaFormPatchDirective,
  ],
})
export class SchemaFormComponent implements OnInit, OnDestroy {
  private $settings = inject(SettingsService)
  private availableLanguages = ['de', 'en', 'es', 'fr', 'it', 'pt', 'zh']

  readonly configSchema = input.required<any>()
  readonly data = input.required<any>()

  readonly dataChange = output<any>()
  readonly dataChanged = output<any>()
  readonly isValid = output<boolean>()

  public readonly currentData = signal<any>(null)
  public readonly language = signal('en')
  public jsonFormOptions = {
    addSubmit: false,
    loadExternalAssets: false,
    returnEmptyFields: false,
    setSchemaDefaults: true,
    autocomplete: false,
  }

  private lastValidState: boolean | undefined = undefined
  private validationTimeout: any = null
  private lastDataReference: any = null
  private processingInternalChange = false

  constructor() {
    // React to data input changes - but only when the reference actually changes
    // This prevents unnecessary re-renders when the same object is modified
    effect(() => {
      const newData = this.data()

      // Skip update if we're processing a change from the form itself
      if (this.processingInternalChange) {
        return
      }

      // Only update if the reference has changed, not just the content
      if (this.lastDataReference !== newData) {
        this.lastDataReference = newData
        this.currentData.set(newData)
      }
    })
  }

  public ngOnInit(): void {
    // Use 'en' by default, unless the user's language is available
    const userLanguage = this.$settings.env.lang.split('-')[0]
    if (this.availableLanguages.includes(userLanguage)) {
      this.language.set(userLanguage)
    }
  }

  public ngOnDestroy(): void {
    // Clear any pending validation timeout to prevent emitting after component is destroyed
    if (this.validationTimeout) {
      clearTimeout(this.validationTimeout)
    }
  }

  public onChanges(data: any) {
    // Set flag to prevent effect from updating currentData
    this.processingInternalChange = true

    // Get the current data object
    const currentDataObj = this.data()

    // Update the existing object in-place to preserve external references
    // Emit the SAME reference (not the new one) to prevent effect from re-running
    if (currentDataObj && typeof currentDataObj === 'object' && typeof data === 'object') {
      // Update existing object in-place (preserves external references)
      for (const key of Object.keys(currentDataObj)) {
        if (!(key in data)) {
          delete currentDataObj[key]
        }
      }
      Object.assign(currentDataObj, data)

      // Emit the SAME reference we just updated (not the new one from json-schema-form)
      // This prevents the effect from seeing a reference change
      this.dataChange.emit(currentDataObj)
      this.dataChanged.emit(currentDataObj)
    } else {
      // Fallback: just emit the new data if we can't update in-place
      this.dataChange.emit(data)
      this.dataChanged.emit(data)
    }

    // Clear flag after a microtask to allow the effect to run for external changes
    queueMicrotask(() => {
      this.processingInternalChange = false
    })
  }

  public validChange(isValid: boolean) {
    // Debounce validation changes to prevent rapid toggling
    if (this.validationTimeout) {
      clearTimeout(this.validationTimeout)
    }

    this.validationTimeout = setTimeout(() => {
      if (this.lastValidState !== isValid) {
        this.lastValidState = isValid
        this.isValid.emit(isValid)
      }
    }, 50)
  }
}
