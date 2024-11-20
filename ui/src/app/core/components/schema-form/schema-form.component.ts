import { SettingsService } from '@/app/core/settings.service'
import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core'

import { JsonSchemaFormModule } from '@ng-formworks/core'
import { JsonSchemaFormPatchDirective } from '../../directives/json-schema-form-patch.directive'

@Component({
  selector: 'app-schema-form',
  templateUrl: './schema-form.component.html',
  imports: [
    JsonSchemaFormModule,
    JsonSchemaFormPatchDirective,
  ],
})
export class SchemaFormComponent implements OnInit {
  private $settings = inject(SettingsService)

  @Input() configSchema: any
  @Input() data: any
  @Output() dataChange = new EventEmitter()
  @Output() dataChanged = new EventEmitter()
  @Output() isValid = new EventEmitter()

  public currentData: any
  public language: string = 'en'
  private availableLanguages = ['de', 'en', 'es', 'fr', 'it', 'pt', 'zh']

  public jsonFormOptions = {
    addSubmit: false,
    loadExternalAssets: false,
    returnEmptyFields: false,
    setSchemaDefaults: true,
    autocomplete: false,
  }

  ngOnInit(): void {
    // Use 'en' by default, unless the user's language is available
    const userLanguage = this.$settings.env.lang.split('-')[0]
    if (this.availableLanguages.includes(userLanguage)) {
      this.language = userLanguage
    }
    this.currentData = this.data
  }

  onChanges(data: any) {
    this.dataChange.emit(data)
    this.dataChanged.emit(data)
  }

  validChange(data: any) {
    this.isValid.emit(data)
  }
}
