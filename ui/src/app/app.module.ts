import { AppComponent } from '@/app/app.component'
import { AppRoutingModule } from '@/app/app-routing.module'
import { AuthModule } from '@/app/core/auth/auth.module'
import { CoreModule } from '@/app/core/core.module'
import { supportedLocales } from '@/app/core/locales'
import { onMonacoLoad } from '@/app/core/monaco-editor.service'
import { LoginModule } from '@/app/modules/login/login.module'
import { RestartModule } from '@/app/modules/restart/restart.module'
import { StatusModule } from '@/app/modules/status/status.module'
import { LayoutComponent } from '@/app/shared/layout/layout.component'
import { SidebarComponent } from '@/app/shared/layout/sidebar/sidebar.component'
import { NgOptimizedImage } from '@angular/common'
import { HttpClientModule } from '@angular/common/http'
import { LOCALE_ID, NgModule } from '@angular/core'
import { BrowserModule } from '@angular/platform-browser'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { DragulaModule } from 'ng2-dragula'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import { ToastrModule } from 'ngx-toastr'

@NgModule({
  declarations: [
    AppComponent,
    LayoutComponent,
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
    NgOptimizedImage,
  ],
  providers: [
    {
      provide: LOCALE_ID,
      useFactory: (translate: TranslateService) => {
        if (translate.currentLang in supportedLocales) {
          return supportedLocales[translate.currentLang]
        } else {
          return 'en'
        }
      },
      deps: [TranslateService],
    },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
