import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { Bootstrap5FrameworkModule } from '@ng-formworks/bootstrap5'
import { TranslateModule } from '@ngx-translate/core'
import { NgxMdModule } from 'ngx-md'

import { CustomPluginsComponent } from '@/app/core/manage-plugins/custom-plugins/custom-plugins.component'
import { CustomPluginsService } from '@/app/core/manage-plugins/custom-plugins/custom-plugins.service'
import { HomebridgeDeconzComponent } from '@/app/core/manage-plugins/custom-plugins/homebridge-deconz/homebridge-deconz.component'
import { HomebridgeHueComponent } from '@/app/core/manage-plugins/custom-plugins/homebridge-hue/homebridge-hue.component'

@NgModule({
  imports: [
    CommonModule,
    NgbModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule.forChild(),
    Bootstrap5FrameworkModule,
    NgxMdModule,
    CustomPluginsComponent,
    HomebridgeDeconzComponent,
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
export class CustomPluginsModule { }
