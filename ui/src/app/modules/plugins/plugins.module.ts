import { CoreModule } from '@/app/core/core.module'
import { ManagePluginsModule } from '@/app/core/manage-plugins/manage-plugins.module'
import { DisablePluginComponent } from '@/app/modules/plugins/plugin-card/disable-plugin/disable-plugin.component'
import { PluginCardComponent } from '@/app/modules/plugins/plugin-card/plugin-card.component'
import { PluginInfoComponent } from '@/app/modules/plugins/plugin-card/plugin-info/plugin-info.component'
import { PluginsComponent } from '@/app/modules/plugins/plugins.component'
import { PluginsRoutingModule } from '@/app/modules/plugins/plugins-routing.module'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { TranslateModule } from '@ngx-translate/core'

@NgModule({
  declarations: [
    DisablePluginComponent,
    PluginsComponent,
    PluginCardComponent,
    PluginInfoComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule.forChild(),
    NgbModule,
    CoreModule,
    ManagePluginsModule,
    PluginsRoutingModule,
  ],
})
export class PluginsModule {}
