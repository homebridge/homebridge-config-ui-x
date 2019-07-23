import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';

import { HomebridgeGoogleSmarthomeComponent } from './homebridge-google-smarthome/homebridge-google-smarthome.component';
import { CustomPluginsService } from './custom-plugins.service';

@NgModule({
  entryComponents: [
    HomebridgeGoogleSmarthomeComponent,
  ],
  declarations: [
    HomebridgeGoogleSmarthomeComponent,
  ],
  imports: [
    CommonModule,
    NgbModule,
    TranslateModule.forChild(),
  ],
  providers: [
    CustomPluginsService,
  ],
})
export class CustomPluginsModule { }
