# Homebridge Config UI

This is a plugin for [Homebridge](https://github.com/nfarina/homebridge)

This plugin allows you to monitor, backup and configure your Homebridge server from a browser.

![Status](status.png)

# Installation Instructions

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
    "log": "/var/log/homebridge.stdout.log",
    "restart": "/usr/local/bin/supervisorctl restart homebridge"
}
```

This example uses [supervisor](http://supervisord.org/) to control homebridge.

Replace /var/log/homebridge.stdout.log with your path to your Homebridge output log.<br />
Replace /usr/local/bin/supervisorctl restart homebridge with the command you use to restart Homebridge.

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

This is a good supervisor how to: [Running Supervisor on OSX](https://nicksergeant.com/running-supervisor-on-os-x/)

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

# Usage

Login Screen

Most of your platform configs have usernames and passwords in them. To keep these seceret, this plugin has basic authentication. The users are stored in the ~/.homebridge/auth.json file.

![Login](login.png)

Status Screen

This shows you that the services are running. It also has your HomeKit pin.

![Status](status.png)

Log Screen

This shows you the rolling log. This is helpful for troubleshooting.

![Log](log.png)

Configuration Screen

And finally the configuration screen allows you to modify your Homebridge settings and your platforms and accessories.

![Config](config.png)
