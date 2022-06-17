import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { CoreModule } from '@/app/core/core.module';
import { ManagePluginsModule } from '@/app/core/manage-plugins/manage-plugins.module';
import { PluginsRoutingModule } from './plugins-routing.module';
import { PluginsComponent } from './plugins.component';
import { DonateModalComponent } from './donate-modal/donate-modal.component';
import { PluginCardComponent } from './plugin-card/plugin-card.component';

@NgModule({
    declarations: [
        PluginsComponent,
        DonateModalComponent,
        PluginCardComponent,
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
export class PluginsModule { }
