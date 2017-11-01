# Homebridge Config UI

This is a plugin for [Homebridge](https://github.com/nfarina/homebridge)

This plugin allows you to monitor, backup and configure your Homebridge server from a browser.

![Status](status.png)

# Installation Instructions

First download the zip or do a git clone
```git clone
git clone https://github.com/shidevil/homebridge-config-ui.git
```

next transfer the file to your raspberry pi or homebridge box. Place it at documents or anywhere you can find, cd into the folder.
```install
sudo npm install -g 
```

### Systemd

Add this to your /var/homebridge/config.json file
```JSON
"platform":[
{
    "platform": "config",
    "name": "Config",
    "port": 8080,
    "log": "/var/log/daemon.log",
    "restart": "sudo systemctl restart homebridge.service",
    "temp" : "/sys/class/thermal/thermal_zone0/temp",
    "base": "/usr/local/lib/node_modules"
}
]
```

Replace <b>/var/log/daemon.log</b> with the path to your Homebridge output log.<br />
Replace <b>sudo systemctl restart homebridge.service</b> with the command you use to restart Homebridge.<br />
Replace <b>/sys/class/thermal/thermal_zone0/temp</b> with the command you use to check the CPU Temperature.<br />
Replace <b>/usr/local/lib/node_modules</b> with the correct base location

<b>Note :</b> If you did not set base path, you won't be able to login.

# Initial Run

Once installed you can open the interface at http://localhost:8080. The default username is <b>admin</b> and the default password is <b>admin</b>.

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
