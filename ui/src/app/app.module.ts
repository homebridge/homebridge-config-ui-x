import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientModule } from '@angular/common/http';
import { NgModule, LOCALE_ID } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { ToastrModule } from 'ngx-toastr';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MonacoEditorModule } from 'ngx-monaco-editor';
import { DragulaModule } from 'ng2-dragula';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LayoutComponent } from './shared/layout/layout.component';
import { CoreModule } from './core/core.module';
import { AuthModule } from './core/auth/auth.module';
import { RestartModule } from './modules/restart/restart.module';
import { StatusModule } from './modules/status/status.module';

import { onMonacoLoad } from './core/monaco-editor.service';
import { supportedLocales } from './core/locales';

@NgModule({
  declarations: [
    AppComponent,
    LayoutComponent,
  ],
  entryComponents: [],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    HttpClientModule,
    TranslateModule.forRoot(),
    ToastrModule.forRoot({
      autoDismiss: true,
      newestOnTop: false,
      closeButton: true,
      maxOpened: 2,
      positionClass: 'toast-bottom-right',
    }),
    NgbModule,
    MonacoEditorModule.forRoot({
      defaultOptions: {
        scrollBeyondLastLine: false,
        quickSuggestions: true,
        parameterHints: true,
        formatOnType: true,
        formatOnPaste: true,
        folding: true,
        minimap: {
          enabled: false,
        },
      },
      onMonacoLoad,
    }),
    DragulaModule.forRoot(),
    CoreModule,
    AuthModule,
    StatusModule,
    RestartModule,
    AppRoutingModule,
  ],
  providers: [
    {
      provide: APP_BASE_HREF,
      useFactory: () => {
        return window.location.pathname.split('/')[1] === 'homebridge' ? '/homebridge' : '';
      },
    },
    {
      provide: LOCALE_ID,
      useFactory: (translate: TranslateService) => {
        if (translate.currentLang in supportedLocales) {
          return supportedLocales[translate.currentLang];
        } else {
          return 'en';
        }
      },
      deps: [TranslateService],
    },
  ],
  bootstrap: [AppComponent],
})
export class AppModule { }
