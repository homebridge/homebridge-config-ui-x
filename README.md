# Homebridge Config UI

This is a plugin for [Homebridge](https://github.com/nfarina/homebridge)

This plugin allows you to monitor, backup and configure your Homebridge server from a browser.

[Status](img.jpg?raw=true)

# Instaliation Instructions

First install the plugin
```Bash
sudo npm i -g homebridge-config-ui
```

Add this to your ~/.homebridge/config.json file
```JSON
{
    "platform": "config",
    "name": "Config",
    "port": 8080,
    "log": "[/var/log/homebridge.stdout.log]",
    "restart": "[/usr/local/bin/supervisorctl restart homebridge]"
}
```

Note: This example uses [supervisor](http://supervisord.org/) to control homebridge.

Example /usr/local/etc/suoervisord.conf entry
```Bash
[program:homebridge]
command=/usr/local/bin/node /usr/local/lib/node_modules/homebridge/bin/homebridge
directory=/usr/local/lib/node_modules/homebridge/bin
user=root
autostart=true
autorestart=true
stdout_logfile=/var/log/homebridge.stdout.log
stderr_logfile=/var/log/homebridge.stderr.log
```

Then you will need to create the ~/.homebridge/auth.json
```Bash
nano ~/.homebridge/auth.json
```

Add users to the auth.json file.
```JSON
[
    {
        "id": 1,
        "username": "[USERNAME]",
        "password": "[PASSWORD]",
        "name": "[FULL NAME]"
    },
    {
        "id": 2,
        "username": "[USERNAME]",
        "password": "[PASSWORD]",
        "name": "[FULL NAME]"
    }
]
```
