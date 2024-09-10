import { BackupComponent } from '@/app/modules/settings/backup/backup.component'
import { RemoveAllAccessoriesComponent } from '@/app/modules/settings/remove-all-accessories/remove-all-accessories.component'
import { RemoveSingleAccessoryComponent } from '@/app/modules/settings/remove-single-accessory/remove-single-accessory.component'
import { RestoreComponent } from '@/app/modules/settings/restore/restore.component'
import { SelectNetworkInterfacesComponent } from '@/app/modules/settings/select-network-interfaces/select-network-interfaces.component'
import { SettingsComponent } from '@/app/modules/settings/settings.component'
import { SettingsRoutingModule } from '@/app/modules/settings/settings-routing.module'
import { UnpairAllBridgesComponent } from '@/app/modules/settings/unpair-all-bridges/unpair-all-bridges.component'
import { UnpairSingleBridgeComponent } from '@/app/modules/settings/unpair-single-bridge/unpair-single-bridge.component'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { TranslateModule } from '@ngx-translate/core'

@NgModule({
  declarations: [
    SettingsComponent,
    UnpairAllBridgesComponent,
    UnpairSingleBridgeComponent,
    RemoveAllAccessoriesComponent,
    RemoveSingleAccessoryComponent,
    SelectNetworkInterfacesComponent,
    RestoreComponent,
    BackupComponent,
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
