import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { RemoveAllCachedAccessoriesModalComponent } from '@/app/modules/settings/remove-all-cached-accessories-modal/remove-all-cached-accessories-modal.component'; // eslint-disable-line max-len
import { RemoveSingleCachedAccessoryModalComponent } from '@/app/modules/settings/remove-single-cached-accessory-modal/remove-single-cached-accessory-modal.component'; // eslint-disable-line max-len
import { ResetHomebridgeModalComponent } from '@/app/modules/settings/reset-homebridge-modal/reset-homebridge-modal.component';
import { SelectNetworkInterfacesComponent } from '@/app/modules/settings/select-network-interfaces/select-network-interfaces.component';
import { SettingsRoutingModule } from '@/app/modules/settings/settings-routing.module';
import { SettingsComponent } from '@/app/modules/settings/settings.component';
import { UnpairAccessoryModalComponent } from '@/app/modules/settings/unpair-accessory-modal/unpair-accessory-modal.component';

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
