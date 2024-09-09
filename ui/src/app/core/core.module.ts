import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { InformationComponent } from '@/app/core/components/information/information.component'
import { QrcodeComponent } from '@/app/core/components/qrcode/qrcode.component'
import { RestartComponent } from '@/app/core/components/restart/restart.component'
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
import { TranslateModule } from '@ngx-translate/core'
import { Bootstrap4FrameworkModule } from '@oznu/ngx-bs4-jsonform'

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
    RestartComponent,
    QrcodeComponent,
  ],
  imports: [
    CommonModule,
    TranslateModule,
    Bootstrap4FrameworkModule,
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
