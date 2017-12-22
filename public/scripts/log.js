window.$(document).ready(function () {
  var autoScrollEnable = true
  var content = window.$('content')

  const ws = new window.WebSocket(`${(window.location.protocol) === 'http:' ? 'ws://' : 'wss://'}${window.location.host}`)

  ws.onopen = () => {
    console.log('websocket open')
  }

  content.on('scroll', function () {
    if (content.scrollTop() + content.innerHeight() >= content[0].scrollHeight) {
      autoScrollEnable = true
    } else {
      autoScrollEnable = false
    }
  })

  if (window.$('#output-log-contents').length > 0) {
    var log = content.find('#output-log-contents')

    ws.onmessage = (msg) => {
      let data = JSON.parse(msg.data)
      log.append(data.data + '<br>')
      if (autoScrollEnable) {
        content.scrollTop(content.prop('scrollHeight'))
      }
    }

    window.$('#clear-log').click(function () {
      window.$.get('/log/clear')
      log.html('')
    })
  }
})
