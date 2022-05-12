import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientModule } from '@angular/common/http';
import { NgModule, LOCALE_ID } from '@angular/core';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { ToastrModule } from 'ngx-toastr';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MonacoEditorModule } from 'ngx-monaco-editor';
import { DragulaModule } from 'ng2-dragula';

import { CoreModule } from '@/app/core/core.module';
import { AuthModule } from '@/app/core/auth/auth.module';
import { onMonacoLoad } from '@/app/core/monaco-editor.service';
import { supportedLocales } from '@/app/core/locales';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { LayoutComponent } from './shared/layout/layout.component';
import { RestartModule } from './modules/restart/restart.module';
import { StatusModule } from './modules/status/status.module';
import { LoginModule } from './modules/login/login.module';

@NgModule({
    declarations: [
        AppComponent,
        LayoutComponent,
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
export class AppModule { }
