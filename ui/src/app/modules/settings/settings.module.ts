import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { RemoveAllCachedAccessoriesModalComponent } from './remove-all-cached-accessories-modal/remove-all-cached-accessories-modal.component'; // eslint-disable-line max-len
import { RemoveSingleCachedAccessoryModalComponent } from './remove-single-cached-accessory-modal/remove-single-cached-accessory-modal.component'; // eslint-disable-line max-len
import { ResetHomebridgeModalComponent } from './reset-homebridge-modal/reset-homebridge-modal.component';
import { SelectNetworkInterfacesComponent } from './select-network-interfaces/select-network-interfaces.component';
import { SettingsRoutingModule } from './settings-routing.module';
import { SettingsComponent } from './settings.component';
import { UnpairAccessoryModalComponent } from './unpair-accessory-modal/unpair-accessory-modal.component';

@NgModule({
  declarations: [
    SettingsComponent,
    ResetHomebridgeModalComponent,
    UnpairAccessoryModalComponent,
    RemoveAllCachedAccessoriesModalComponent,
    RemoveSingleCachedAccessoryModalComponent,
    SelectNetworkInterfacesComponent,
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
export class SettingsModule {}
