import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { UIRouterModule } from '@uirouter/angular';
import { AceEditorModule } from 'ng2-ace-editor';
import { ToastModule, ToastOptions } from 'ng2-toastr/ng2-toastr';
import { MarkdownModule } from 'ngx-md';

import {
  JsonSchemaFormModule,
  Bootstrap4FrameworkModule,
  Bootstrap4Framework,
  Framework,
  WidgetLibraryService,
  FrameworkLibraryService,
  JsonSchemaFormService
} from 'angular2-json-schema-form';

import { ToastCustomOptions } from './_helpers/toast.class';
import { routerConfigFn } from './_helpers/router.config';

import { WsService } from './_services/ws.service';
import { ApiService } from './_services/api.service';
import { PluginService } from './_services/plugin.service';
import { AuthService } from './_services/auth.service';
import { AuthHttpInterceptor } from './_services/http.service';
import { MobileDetectService } from './_services/mobile-detect.service';

import { SpinnerModule } from './spinner/spinner.module';
import { AccessoriesModule } from './accessories/accessories.module';
import { PlatformToolsModule } from './platform-tools/platform-tools.module';

import { AppComponent } from './app.component';
import { StatusComponent, StatusStates } from './status/status.component';
import { PluginsComponent, PluginStates } from './plugins/plugins.component';
import { PluginSearchComponent, PluginSearchStates } from './plugins/plugins.search.component';
import { PluginsManageComponent } from './plugins/plugins.manage.component';
import { PluginSettingsComponent } from './plugins/plugins.settings.component';
import { ConfigComponent, ConfigStates } from './config/config.component';
import { LogsComponent, LogsStates } from './logs/logs.component';
import { UsersComponent, UsersStates } from './users/users.component';
import { UsersAddComponent } from './users/users.add.component';
import { UsersEditComponent } from './users/users.edit.component';
import { RestartComponent, RestartState } from './restart/restart.component';
import { LoginComponent, LoginStates } from './login/login.component';
import { ResetComponent, ResetModalComponent } from './reset/reset.component';

@NgModule({
  declarations: [
    AppComponent,
    StatusComponent,
    PluginsComponent,
    ConfigComponent,
    LogsComponent,
    UsersComponent,
    PluginSearchComponent,
    PluginsManageComponent,
    PluginSettingsComponent,
    UsersAddComponent,
    UsersEditComponent,
    RestartComponent,
    LoginComponent,
    ResetComponent,
    ResetModalComponent
  ],
  entryComponents: [
    PluginsManageComponent,
    PluginSettingsComponent,
    UsersAddComponent,
    UsersEditComponent,
    ResetModalComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule,
    AceEditorModule,
    SpinnerModule,
    Bootstrap4FrameworkModule,
    {
      ngModule: JsonSchemaFormModule,
      providers: [
        JsonSchemaFormService,
        FrameworkLibraryService,
        WidgetLibraryService,
        { provide: Framework, useClass: Bootstrap4Framework, multi: true }
      ]
    },
    MarkdownModule.forRoot(),
    ToastModule.forRoot(),
    NgbModule.forRoot(),
    UIRouterModule.forRoot({
      states: [
        StatusStates,
        ConfigStates,
        LogsStates,
        UsersStates,
        PluginStates,
        PluginSearchStates,
        RestartState,
        LoginStates
      ],
      useHash: false,
      config: routerConfigFn,
      otherwise: '/'
    }),
    AccessoriesModule,
    PlatformToolsModule
  ],
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: AuthHttpInterceptor, multi: true },
    { provide: ToastOptions, useClass: ToastCustomOptions },
    AuthService,
    WsService,
    ApiService,
    PluginService,
    MobileDetectService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
