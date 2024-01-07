import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { CoreModule } from '@/app/core/core.module';
import { ManagePluginsModule } from '@/app/core/manage-plugins/manage-plugins.module';
import { PluginCardComponent } from '@/app/modules/plugins/plugin-card/plugin-card.component';
import { PluginInfoComponent } from '@/app/modules/plugins/plugin-card/plugin-info/plugin-info.component';
import { PluginsRoutingModule } from '@/app/modules/plugins/plugins-routing.module';
import { PluginsComponent } from '@/app/modules/plugins/plugins.component';

@NgModule({
  declarations: [
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
