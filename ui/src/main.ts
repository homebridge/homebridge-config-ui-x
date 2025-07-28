import { NgOptimizedImage } from '@angular/common'
import { provideHttpClient, withFetch, withInterceptorsFromDi } from '@angular/common/http'
import { enableProdMode, importProvidersFrom, LOCALE_ID } from '@angular/core'
import { bootstrapApplication, BrowserModule } from '@angular/platform-browser'
import { provideAnimations } from '@angular/platform-browser/animations'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { provideTranslateService, TranslateService } from '@ngx-translate/core'
import { DragulaModule } from 'ng2-dragula'
import { MonacoEditorModule } from 'ngx-monaco-editor-v2'
import { ToastrModule } from 'ngx-toastr'

import { AppRoutingModule } from '@/app/app-routing.module'
import { AppComponent } from '@/app/app.component'
import { AuthModule } from '@/app/core/auth/auth.module'
import { supportedLocales } from '@/app/core/locales'
import { onMonacoLoad } from '@/app/core/monaco-editor.service'
import { LoginModule } from '@/app/modules/login/login.module'
import { RestartModule } from '@/app/modules/restart/restart.module'
import { StatusModule } from '@/app/modules/status/status.module'
import { environment } from '@/environments/environment'

import '../../src/globalDefaults'

if (environment.production) {
  enableProdMode()
}

bootstrapApplication(AppComponent, {
  providers: [
    importProvidersFrom(
      BrowserModule,
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
      AuthModule,
      LoginModule,
      StatusModule,
      RestartModule,
      AppRoutingModule,
      NgOptimizedImage,
    ),
    {
      provide: LOCALE_ID,
      useFactory: (translate: TranslateService) => {
        if (translate.getCurrentLang() in supportedLocales) {
          return supportedLocales[translate.getCurrentLang()]
        } else {
          return 'en'
        }
      },
      deps: [TranslateService],
    },
    provideAnimations(),
    provideHttpClient(withFetch(), withInterceptorsFromDi()),
    provideTranslateService({
      fallbackLang: 'en',
      lang: 'en',
    }),
  ],
}).catch(err => console.error(err))
