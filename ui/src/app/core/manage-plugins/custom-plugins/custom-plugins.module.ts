import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { Bootstrap5FrameworkModule } from '@zajsf/bootstrap5';
import { NgxMdModule } from 'ngx-md';
import { CoreModule } from '@/app/core/core.module';
import { CustomPluginsComponent } from '@/app/core/manage-plugins/custom-plugins/custom-plugins.component';
import { CustomPluginsService } from '@/app/core/manage-plugins/custom-plugins/custom-plugins.service';
import { HomebridgeDeconzComponent } from '@/app/core/manage-plugins/custom-plugins/homebridge-deconz/homebridge-deconz.component';
import { HomebridgeGoogleSmarthomeComponent } from '@/app/core/manage-plugins/custom-plugins/homebridge-google-smarthome/homebridge-google-smarthome.component'; // eslint-disable-line max-len
import { HomebridgeHueComponent } from '@/app/core/manage-plugins/custom-plugins/homebridge-hue/homebridge-hue.component';

@NgModule({
  declarations: [
    CustomPluginsComponent,
    HomebridgeDeconzComponent,
    HomebridgeGoogleSmarthomeComponent,
    HomebridgeHueComponent,
  ],
  imports: [
    CommonModule,
    NgbModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule.forChild(),
    Bootstrap5FrameworkModule,
    NgxMdModule,
    CoreModule,
  ],
  providers: [
    CustomPluginsService,
  ],
  exports: [
    HomebridgeDeconzComponent,
    HomebridgeHueComponent,
  ],
})
export class CustomPluginsModule {}
