import { CustomPluginsComponent } from '@/app/core/manage-plugins/custom-plugins/custom-plugins.component'
import { CustomPluginsService } from '@/app/core/manage-plugins/custom-plugins/custom-plugins.service'
import { HomebridgeDeconzComponent } from '@/app/core/manage-plugins/custom-plugins/homebridge-deconz/homebridge-deconz.component'
import { HomebridgeGoogleSmarthomeComponent } from '@/app/core/manage-plugins/custom-plugins/homebridge-google-smarthome/homebridge-google-smarthome.component'
import { HomebridgeHueComponent } from '@/app/core/manage-plugins/custom-plugins/homebridge-hue/homebridge-hue.component'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { Bootstrap4FrameworkModule } from '@ng-formworks/bootstrap4'
import { TranslateModule } from '@ngx-translate/core'
import { NgxMdModule } from 'ngx-md'

@NgModule({
  imports: [
    CommonModule,
    NgbModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule.forChild(),
    Bootstrap4FrameworkModule,
    NgxMdModule,
    CustomPluginsComponent,
    HomebridgeDeconzComponent,
    HomebridgeGoogleSmarthomeComponent,
    HomebridgeHueComponent,
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
