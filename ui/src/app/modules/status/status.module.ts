import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';

import { CoreModule } from '../../core/core.module';
import { StatusRoutingModule } from './status-routing.module';
import { StatusComponent } from './status.component';
import { ResetHomebridgeModalComponent } from './reset-homebridge-modal/reset-homebridge-modal.component';
import { ManagePluginsModule } from '../../core/manage-plugins/manage-plugins.module';

@NgModule({
  entryComponents: [
    ResetHomebridgeModalComponent,
  ],
  declarations: [
    StatusComponent,
    ResetHomebridgeModalComponent,
  ],
  imports: [
    CommonModule,
    TranslateModule.forChild(),
    NgbModule,
    CoreModule,
    ManagePluginsModule,
    StatusRoutingModule,
  ]
})
export class StatusModule { }
