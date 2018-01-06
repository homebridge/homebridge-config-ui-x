import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { UIRouterModule, StateService } from '@uirouter/angular';
import { AceEditorModule } from 'ng2-ace-editor';
import { ToastModule, ToastOptions } from 'ng2-toastr/ng2-toastr';

import { AppComponent } from './app.component';
import { StatusComponent, StatusStates } from './status/status.component';
import { PluginsComponent, PluginStates } from './plugins/plugins.component';
import { PluginSearchComponent, PluginSearchStates } from './plugins/plugins.search.component';
import { PluginsManageComponent } from './plugins/plugins.manage.component';
import { ConfigComponent, ConfigStates } from './config/config.component';
import { LogsComponent, LogsStates } from './logs/logs.component';
import { UsersComponent, UsersStates } from './users/users.component';
import { PinComponent } from './pin/pin.component';

import { WsService } from './_services/ws.service';
import { ApiService } from './_services/api.service';
import { PluginService } from './_services/plugin.service';
import { SpinnerComponent } from './spinner/spinner.component';

class ToastCustomOptions extends ToastOptions {
  animate = 'flyRight';
  newestOnTop = false;
  showCloseButton = true;
  maxShown = 2;
  positionClass = 'toast-bottom-right';
}

@NgModule({
  declarations: [
    AppComponent,
    StatusComponent,
    PluginsComponent,
    ConfigComponent,
    LogsComponent,
    UsersComponent,
    PinComponent,
    SpinnerComponent,
    PluginSearchComponent,
    PluginsManageComponent
  ],
  entryComponents: [
    PluginsManageComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule,
    AceEditorModule,
    ToastModule.forRoot(),
    NgbModule.forRoot(),
    UIRouterModule.forRoot({ states: [
      StatusStates,
      ConfigStates,
      LogsStates,
      UsersStates,
      PluginStates,
      PluginSearchStates,
    ], useHash: false }),
  ],
  providers: [
    { provide: ToastOptions, useClass: ToastCustomOptions },
    WsService,
    ApiService,
    PluginService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
