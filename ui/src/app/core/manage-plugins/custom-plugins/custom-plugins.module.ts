import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { Bootstrap4FrameworkModule } from '@oznu/ngx-bs4-jsonform';
import { NgxMdModule } from 'ngx-md';

import { CoreModule } from '../../core.module';
import { HomebridgeGoogleSmarthomeComponent } from './homebridge-google-smarthome/homebridge-google-smarthome.component';
import { CustomPluginsService } from './custom-plugins.service';
import { HomebridgeHoneywellHomeComponent } from './homebridge-honeywell-home/homebridge-honeywell-home.component';

@NgModule({
  entryComponents: [
    HomebridgeGoogleSmarthomeComponent,
    HomebridgeHoneywellHomeComponent,
  ],
  declarations: [
    HomebridgeGoogleSmarthomeComponent,
    HomebridgeHoneywellHomeComponent,
  ],
  imports: [
    CommonModule,
    NgbModule,

    TranslateModule.forChild(),
    Bootstrap4FrameworkModule,
    NgxMdModule,
    CoreModule,
  ],
  providers: [
    CustomPluginsService,
  ],
})
export class CustomPluginsModule { }
