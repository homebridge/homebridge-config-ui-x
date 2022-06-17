import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { Bootstrap4FrameworkModule } from '@oznu/ngx-bs4-jsonform';
import { NgxMdModule } from 'ngx-md';

import { CoreModule } from '@/app/core/core.module';
import { CustomPluginsService } from './custom-plugins.service';

import { CustomPluginsComponent } from './custom-plugins.component';
import { HomebridgeGoogleSmarthomeComponent } from './homebridge-google-smarthome/homebridge-google-smarthome.component';
import { HomebridgeHueComponent } from './homebridge-hue/homebridge-hue.component';

@NgModule({
    declarations: [
        CustomPluginsComponent,
        HomebridgeGoogleSmarthomeComponent,
        HomebridgeHueComponent,
    ],
    imports: [
        CommonModule,
        NgbModule,
        FormsModule,
        ReactiveFormsModule,
        TranslateModule.forChild(),
        Bootstrap4FrameworkModule,
        NgxMdModule,
        CoreModule,
    ],
    providers: [
        CustomPluginsService,
    ],
    exports: [
        HomebridgeHueComponent,
    ],
})
export class CustomPluginsModule { }
