import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { Bootstrap4FrameworkModule } from '@oznu/ngx-bs4-jsonform';

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
    Bootstrap4FrameworkModule,
  ],
  providers: [
    CustomPluginsService,
  ],
})
export class CustomPluginsModule { }
