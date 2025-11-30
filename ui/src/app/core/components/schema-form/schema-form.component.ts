import { Component, effect, inject, input, OnDestroy, OnInit, output, signal } from '@angular/core'
import { JsonSchemaFormModule } from '@ng-formworks/core'

import { JsonSchemaFormPatchDirective } from '@/app/core/directives/json-schema-form-patch.directive'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
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

  configSchema = input.required<any>()
  data = input.required<any>()

  readonly dataChange = output()
  readonly dataChanged = output()
  readonly isValid = output<boolean>()

  public currentData = signal<any>(null)
  public language = signal('en')
  public jsonFormOptions = {
    addSubmit: false,
    loadExternalAssets: false,
    returnEmptyFields: false,
    setSchemaDefaults: true,
    autocomplete: false,
  }

  private lastValidState: boolean | undefined = undefined
  private validationTimeout: any = null

  constructor() {
    // React to data input changes
    effect(() => {
      this.currentData.set(this.data())
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
    this.dataChange.emit(data)
    this.dataChanged.emit(data)
  }

  public validChange(isValid: boolean) {
    // Debounce validation changes to prevent flickering
    if (this.validationTimeout) {
      clearTimeout(this.validationTimeout)
    }

    this.validationTimeout = setTimeout(() => {
      if (this.lastValidState !== isValid) {
        this.lastValidState = isValid
        this.isValid.emit(isValid)
      }
    }, 100)
  }
  //
  // public validationErrors(errors: any[] | null) {
  //   if (errors) {
  //     errors.forEach(error => console.error(error.instancePath, error.message))
  //   }
  // }
}
