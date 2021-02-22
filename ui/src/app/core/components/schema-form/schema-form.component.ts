import { Component, OnInit, Input, Output } from '@angular/core';
import { EventEmitter } from '@angular/core';

@Component({
  selector: 'app-schema-form',
  templateUrl: './schema-form.component.html',
})
export class SchemaFormComponent implements OnInit {
  public currentData;

  @Input() configSchema;
  @Input() data;
  @Output() dataChange = new EventEmitter();
  @Output() dataChanged = new EventEmitter();

  public jsonFormOptions = {
    addSubmit: false,
    loadExternalAssets: false,
    returnEmptyFields: false,
    setSchemaDefaults: true,
  };

  constructor() { }

  ngOnInit(): void {
    this.currentData = this.data;
  }

  onChanges(data) {
    this.dataChange.emit(data);
    this.dataChanged.emit(data);
  }

}
