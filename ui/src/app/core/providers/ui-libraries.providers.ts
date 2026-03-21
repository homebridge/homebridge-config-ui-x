import { importProvidersFrom } from '@angular/core'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { Bootstrap5FrameworkModule } from '@ng-formworks/bootstrap5'
import { provideCharts, withDefaultRegisterables } from 'ng2-charts'
import { DragulaModule } from 'ng2-dragula'
import { NgxMonacoEditorConfig, provideMonacoEditor } from 'ngx-monaco-editor-v2'
import { provideToastr } from 'ngx-toastr'

import { onMonacoLoad } from '@/app/core/ui/monaco-editor.service'

const monacoBaseUrl = './assets/monaco/min/vs'

const monacoConfig: NgxMonacoEditorConfig = {
  baseUrl: monacoBaseUrl,
  defaultOptions: {
    'automaticLayout': true,
    'copyWithSyntaxHighlighting': true,
    'ignoreTrimWhitespace': false,
    'scrollBeyondLastLine': false,
    'quickSuggestions': true,
    'parameterHints': true,
    'formatOnType': true,
    'formatOnPaste': true,
    'folding': true,
    'bracketPairColorization.enabled': true,
    'minimap': {
      enabled: true,
      showSlider: 'mouseover',
      scale: 2,
    },
    'smoothScrolling': true,
    'cursorSmoothCaretAnimation': 'on',
    'stickyScroll': {
      enabled: true,
    },
    'renderWhitespace': 'boundary',
    'tabCompletion': 'on',
    'unicodeHighlight': {
      ambiguousCharacters: true,
      invisibleCharacters: true,
    },
    'suggest': {
      showWords: true,
      showSnippets: true,
      preview: true,
    },
  },
  onMonacoLoad: () => {
    onMonacoLoad()
  },
}

/**
 * Provides UI library configurations:
 * - Bootstrap components (NgbModule)
 * - Drag and drop (DragulaModule)
 * - Toast notifications
 * - Chart.js
 * - Monaco Editor
 * - JSON Schema Form with Bootstrap 5 framework
 */
export function provideUiLibraries() {
  return [
    importProvidersFrom(
      NgbModule,
      DragulaModule.forRoot(),
      Bootstrap5FrameworkModule,
    ),
    provideToastr({
      autoDismiss: true,
      newestOnTop: false,
      closeButton: true,
      maxOpened: 2,
      positionClass: 'toast-bottom-right',
    }),
    provideCharts(withDefaultRegisterables()),
    provideMonacoEditor(monacoConfig),
  ]
}
