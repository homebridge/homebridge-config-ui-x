import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { SettingsRoutingModule } from './settings-routing.module';
import { SettingsComponent } from './settings.component';
import { RemoveAllCachedAccessoriesModalComponent } from './remove-all-cached-accessories-modal/remove-all-cached-accessories-modal.component';
import { RemoveSingleCachedAccessoryModalComponent } from './remove-single-cached-accessory-modal/remove-single-cached-accessory-modal.component';

@NgModule({
  entryComponents: [
    RemoveAllCachedAccessoriesModalComponent,
    RemoveSingleCachedAccessoryModalComponent,
  ],
  declarations: [
    SettingsComponent,
    RemoveAllCachedAccessoriesModalComponent,
    RemoveSingleCachedAccessoryModalComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    NgbModule,
    SettingsRoutingModule,
  ],
})
export class SettingsModule { }
