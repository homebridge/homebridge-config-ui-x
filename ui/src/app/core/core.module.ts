import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { InformationComponent } from '@/app/core/components/information/information.component'
import { QrcodeComponent } from '@/app/core/components/qrcode/qrcode.component'
import { RestartChildBridgesComponent } from '@/app/core/components/restart-child-bridges/restart-child-bridges.component'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { SchemaFormComponent } from '@/app/core/components/schema-form/schema-form.component'
import { SpinnerComponent } from '@/app/core/components/spinner/spinner.component'
import { JsonSchemaFormPatchDirective } from '@/app/core/directives/json-schema-form-patch.directive'
import { LongClickDirective } from '@/app/core/directives/longclick.directive'
import { PluginsMarkdownDirective } from '@/app/core/directives/plugins.markdown.directive'
import { RtlDirective } from '@/app/core/directives/rtl.directive'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { ExternalLinkIconPipe } from '@/app/core/pipes/external-link-icon.pipe'
import { ReplacePipe } from '@/app/core/pipes/replace.pipe'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { Bootstrap4FrameworkModule } from '@ng-formworks/bootstrap4'
import { TranslateModule } from '@ngx-translate/core'

@NgModule({
  declarations: [
    SpinnerComponent,
    SchemaFormComponent,
    ConvertTempPipe,
    ReplacePipe,
    ExternalLinkIconPipe,
    PluginsMarkdownDirective,
    LongClickDirective,
    RtlDirective,
    JsonSchemaFormPatchDirective,
    ConfirmComponent,
    InformationComponent,
    RestartHomebridgeComponent,
    RestartChildBridgesComponent,
    QrcodeComponent,
  ],
  imports: [
    CommonModule,
    TranslateModule,
    Bootstrap4FrameworkModule,
    ReactiveFormsModule,
  ],
  providers: [],
  exports: [
    SpinnerComponent,
    SchemaFormComponent,
    QrcodeComponent,
    ConvertTempPipe,
    ReplacePipe,
    ExternalLinkIconPipe,
    PluginsMarkdownDirective,
    LongClickDirective,
    RtlDirective,
    JsonSchemaFormPatchDirective,
  ],
})
export class CoreModule {}
