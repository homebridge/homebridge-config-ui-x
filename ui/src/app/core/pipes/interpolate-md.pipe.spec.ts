import { afterEach, describe, expect, it } from 'vitest'

import { InterpolateMdPipe } from '@/app/core/pipes/interpolate-md.pipe'

describe('InterpolateMdPipe', () => {
  const pipe = new InterpolateMdPipe()
  const originalHostname = window.location.hostname

  afterEach(() => {
    window.location.hostname = originalHostname
  })

  it('substitutes the current hostname everywhere it appears', () => {
    window.location.hostname = 'homebridge.local'

    // eslint-disable-next-line no-template-curly-in-string -- this is the literal placeholder text, not a template literal
    const source = 'Open http://${{HOSTNAME}}:8581 or http://${{HOSTNAME}}:8080'

    expect(pipe.transform(source)).toBe('Open http://homebridge.local:8581 or http://homebridge.local:8080')
  })

  it('leaves text without the placeholder alone', () => {
    expect(pipe.transform('Nothing to replace here')).toBe('Nothing to replace here')
  })

  it('does not escape the markdown it is given', () => {
    // Deliberate: the output goes to the markdown renderer, which is where
    // sanitising happens
    expect(pipe.transform('**bold** <b>tag</b>')).toBe('**bold** <b>tag</b>')
  })
})
