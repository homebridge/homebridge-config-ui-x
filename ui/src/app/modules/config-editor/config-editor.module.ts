import { ConfigEditorRoutingModule } from '@/app/modules/config-editor/config-editor-routing.module'
import { ConfigEditorComponent } from '@/app/modules/config-editor/config-editor.component'
import { ConfigEditorResolver } from '@/app/modules/config-editor/config-editor.resolver'
import { ConfigRestoreComponent } from '@/app/modules/config-editor/config-restore/config.restore.component'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { TranslateModule } from '@ngx-translate/core'
import { MonacoEditorModule } from 'ngx-monaco-editor-v2'

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MonacoEditorModule,
    NgbModule,
    TranslateModule.forChild(),
    ConfigEditorRoutingModule,
    ConfigEditorComponent,
    ConfigRestoreComponent,
  ],
  providers: [
    ConfigEditorResolver,
  ],
})
export class ConfigEditorModule {}
