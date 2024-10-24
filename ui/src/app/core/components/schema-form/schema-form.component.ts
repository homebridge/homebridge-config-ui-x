import { SettingsService } from '@/app/core/settings.service'
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core'

@Component({
  selector: 'app-schema-form',
  templateUrl: './schema-form.component.html',
})
export class SchemaFormComponent implements OnInit {
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

  constructor(
    private $settings: SettingsService,
  ) {}

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
