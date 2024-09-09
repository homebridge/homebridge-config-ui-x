import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core'

@Component({
  selector: 'app-schema-form',
  templateUrl: './schema-form.component.html',
})
export class SchemaFormComponent implements OnInit {
  @Input() configSchema
  @Input() data
  @Output() dataChange = new EventEmitter()
  @Output() dataChanged = new EventEmitter()
  @Output() isValid = new EventEmitter()

  public currentData

  public jsonFormOptions = {
    addSubmit: false,
    loadExternalAssets: false,
    returnEmptyFields: false,
    setSchemaDefaults: true,
    autocomplete: false,
  }

  constructor() {}

  ngOnInit(): void {
    this.currentData = this.data
  }

  onChanges(data) {
    this.dataChange.emit(data)
    this.dataChanged.emit(data)
  }

  validChange(data) {
    this.isValid.emit(data)
  }
}
