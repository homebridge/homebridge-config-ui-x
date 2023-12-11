import { HttpClientModule } from '@angular/common/http';
import { LOCALE_ID, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DragulaModule } from 'ng2-dragula';
import { MonacoEditorModule } from 'ngx-monaco-editor';
import { ToastrModule } from 'ngx-toastr';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AuthModule } from './core/auth/auth.module';
import { CoreModule } from './core/core.module';
import { supportedLocales } from './core/locales';
import { onMonacoLoad } from './core/monaco-editor.service';
import { LoginModule } from './modules/login/login.module';
import { RestartModule } from './modules/restart/restart.module';
import { StatusModule } from './modules/status/status.module';
import { LayoutComponent } from './shared/layout/layout.component';
import { PowerOptionsComponent } from '@/app/shared/layout/power-options/power-options.component';
import { SidebarComponent } from '@/app/shared/layout/sidebar/sidebar.component';

@NgModule({
  declarations: [
    AppComponent,
    LayoutComponent,
    PowerOptionsComponent,
    SidebarComponent,
  ],
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
    LoginModule,
    StatusModule,
    RestartModule,
    AppRoutingModule,
  ],
  providers: [
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
export class AppModule {}
