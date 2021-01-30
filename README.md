[![npm](https://badgen.net/npm/v/homebridge-config-ui-x/latest)](https://www.npmjs.com/package/homebridge-config-ui-x)
[![npm](https://badgen.net/npm/dt/homebridge-config-ui-x)](https://www.npmjs.com/package/homebridge-config-ui-x)
[![Discord](https://img.shields.io/discord/432663330281226270?color=728ED5&logo=discord&label=discord)](https://discord.gg/C87Pvq3)
[![Donate](https://badgen.net/badge/donate/paypal/yellow)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=ZEW8TFQCU2MSJ&source=url)

Supported Languages: :gb: :de: :fr: :poland: :czech_republic: :ru: :cn: :hungary: :jp: :es: :netherlands: :tr: :it: :bulgaria: :sweden: :norway: :slovenia: :brazil: :portugal: :indonesia: :kr: :macedonia:

# Homebridge Config UI X

[Homebridge Config UI X](https://www.npmjs.com/package/homebridge-config-ui-x) is a web based management tool for [Homebridge](https://github.com/homebridge/homebridge) that allows you to manage all aspects of your Homebridge setup.

* Install and configure Homebridge plugins
* Edit the Homebridge `config.json` with advanced JSON syntax checking and structure validation
* Visual configuration for over 400 plugins (no manual config.json editing required)
* Monitor your Homebridge server via a fully customisable widget-based dashboard
* View the Homebridge logs
* View and control Homebridge accessories
* Restart Homebridge
* Backup and Restore your Homebridge instance
* and more...

Homebridge Config UI X also provides a tool called [`hb-service`](https://github.com/oznu/homebridge-config-ui-x/wiki/Homebridge-Service-Command) which makes it easy to setup Homebridge as a service on Linux/Raspbian, macOS and Windows 10.

[![Status](screenshots/homebridge-config-ui-x-darkmode-status.png?2020-01-07)](#usage)

# Installation Instructions

For detailed instructions on how to setup Homebridge with Homebridge Config UI X as a service see the guides on the wiki:

* [Setup Homebridge using the official Homebridge Raspberry Pi Image](https://github.com/homebridge/homebridge-raspbian-image/wiki/Getting-Started)
* [Setup Homebridge as service on Linux / Raspbian](https://github.com/oznu/homebridge-config-ui-x/wiki/Homebridge-&-Systemd-(Raspbian,-Ubuntu,-Debian))
* [Setup Homebridge as service on Windows 10](https://github.com/oznu/homebridge-config-ui-x/wiki/Homebridge-on-Windows-10)
* [Setup Homebridge as service on macOS](https://github.com/oznu/homebridge-config-ui-x/wiki/Homebridge-UI-on-macOS)

```
sudo npm install -g --unsafe-perm homebridge-config-ui-x
```

Once you have installed and configured the plugin you can access the interface via http://localhost:8080.

The default username is `admin` and the default password is `admin`.

*Docker users should set the environment variable `HOMEBRIDGE_CONFIG_UI=1` to enable the UI. No further manual installation or configuration is required. [See wiki for details](https://github.com/oznu/homebridge-config-ui-x/wiki/Enabling-UI-with-Docker).*

# Configuration

Add this to your homebridge `config.json` file

```json
"platforms": [
    {
      "platform": "config",
      "name": "Config",
      "port": 8080,
      "sudo": false
    }
]
```

**Optional Settings**

* `log` - [See below for details](#log-viewer-configuration).
* `sudo` - [See below for details](#sudo-mode).
* `restart` - The command to run when a restart request is sent from the browser. If not populated it will just terminate the Homebridge process and let your process manager (like systemd) restart it.
* `theme` - [See wiki for details](https://github.com/oznu/homebridge-config-ui-x/wiki/Themes)
* `ssl` - [See below for details](#enabling-ssl)

All config options are [listed here](https://github.com/oznu/homebridge-config-ui-x/wiki/Config-Options).

## Accessory Control

The plugin allows you to view and control some types of Homebridge accessories from your web browser.

To [enable accessory control](https://github.com/oznu/homebridge-config-ui-x/wiki/Enabling-Accessory-Control) you must be running Homebridge in insecure mode:

```
homebridge -I
```

Not all accessory types are supported. See [this issue](https://github.com/oznu/homebridge-config-ui-x/issues/47) for a full list of supported accessory types.

**Controlling Multiple Instances**

*Homebridge Config UI X's* Accessory Control feature allows you to control the accessories from multiple instances of Homebridge. To make this work all instances you want to control must have the same PIN, be on the same network, and be running in insecure mode. Your other instances are automatically discovered, however you can blacklist instances you don't want to control using the plugin settings.

## Log Viewer Configuration

*Homebridge Config UI X* allows you to view the homebridge process logs in the browser. These logs can be loaded from a file or from a command.

### Logs From File

Example loading logs from a file, change `/var/log/homebridge.log` to the actual location of your log file:

```json
"platforms": [
    {
      "platform": "config",
      "name": "Config",
      "port": 8080,
      "log": {
        "method": "file",
        "path": "/var/log/homebridge.log"
      }
    }
]
```

*Make sure the user which is running the Homebridge process has the correct permissions to read the log file. You may need to enable the [sudo option](#sudo-mode) to avoid permission errors if you are not running Homebridge as root.*

### Logs From Systemd

If you're using `systemd` to manage the Homebridge process then you can just set the `method` to `systemd`:

```json
"platforms": [
    {
      "platform": "config",
      "name": "Config",
      "port": 8080,
      "restart": "sudo -n systemctl restart homebridge",
      "log": {
        "method": "systemd",
        "service": "homebridge"
      }
    }
]
```

*You may need to enable the [sudo option](#sudo-mode) to avoid permission errors if you are not running Homebridge as root.*

### Logs From Custom Command

The `log` option can alternatively specify a command to spawn that will stream the logs to the client. This command should stream the logs to `stdout`:

```json
"platforms": [
    {
      "platform": "config",
      "name": "Config",
      "port": 8080,
      "log": {
        "method": "custom",
        "command": "sudo -n tail -n 100 -f /var/log/homebridge.log"
      }
    }
]
```

## Sudo Mode

Many operations performed by *Homebridge Config UI X*, such as installing plugins, upgrading Homebridge and viewing the logs can require root permissions. You can run the Homebridge service as root or you can enable the `sudo` option in the config.

```json
"platforms": [
    {
      "platform": "config",
      "name": "Config",
      "port": 8080,
      "sudo": true
    }
]
```

When `sudo` mode is enabled *Homebridge Config UI X* will use `sudo` when executing installing, removing or upgrading plugins, viewing the logs using the [Logs From File](#logs-from-file) or [Logs From Systemd](#logs-from-systemd) method, and when upgrading Homebridge. It will not be used for [Logs From Custom Command](#logs-from-custom-command) or custom restart commands.

### Password-less sudo required

For `sudo` mode to work password-less sudo is required. You can enable password-less sudo by adding this entry to the bottom of your `/etc/sudoers` file (use `visudo` to edit the file!):

```
homebridge    ALL=(ALL) NOPASSWD: ALL
```

*Replace `homebridge` with the actual user you are running Homebridge as.*

## Enabling SSL

You can run this plugin over an encrypted HTTPS connection by configuring the `ssl` options.

```json
"platforms": [
    {
      "platform": "config",
      "name": "Config",
      "port": 8080,
      "ssl": {
        "key": "/path/to/privkey.pem",
        "cert": "/path/to/fullchain.pem"
      }
    }
]
```

Or if using a **PKCS#12** certificate you can setup SSL like this:

```json
"platforms": [
    {
      "platform": "config",
      "name": "Config",
      "port": 8080,
      "ssl": {
        "pfx": "/path/to/cert.pfx",
        "passphrase": "sample"
      }
    }
]
```

# Usage

### Status Screen

This shows an overview of your Homebridge system. The dashboard is widget based and completely customisable.

![Status](screenshots/homebridge-config-ui-x-status.png?2020-01-07)

### Plugin Screen

This shows you the currently installed plugins and allows you to install, remove and upgrade plugins.

![Plugin](screenshots/homebridge-config-ui-x-darkmode-plugins.png?2020-01-07)

You can configure supported plugins using the graphical settings editor, removing the need to manually edit the `config.json`. Over 165 popular plugins have implemented support for this feature.

![Plugin Settings](screenshots/homebridge-config-ui-x-darkmode-alexa-settings.png?2020-01-07)

### Configuration Screen

The configuration screen allows you to modify your Homebridge `config.json`. The built in editor automatically syntax-checks your JSON and makes a backup of your config every time you make a change.

![Config](screenshots/homebridge-config-ui-x-config.png?2020-01-07)

### Log Screen

This shows you the Homebridge rolling log. This is helpful for troubleshooting.

![Log](screenshots/homebridge-config-ui-x-logs.png?2020-01-07)

### Accessories Screen

This shows you the Homebridge accessories for all the Homebridge instances on your network. You can use this to control accessories from a web browser and works well on mobile devices which allows users to control Homebridge from non-Apple devices.

![Accessories](screenshots/homebridge-config-ui-x-accessories.png?2020-01-07)

# Supported Browsers

The following browsers are supported by this plugin:

* Chrome - latest
* Edge - latest
* Firefox - latest
* Safari - 2 most recent major versions
* iOS - 2 most recent major versions

MS Internet Explorer (any version) is not supported!

# Supported Node.js and Npm Versions

While this plugin should work on Node.js 8+, only the following versions of Node.js are officially supported:

* node v10.17.0 or higher
* npm v6.4.1 or higher

You can check your current versions using these commands:

```shell
# check node version
node -v

# check npm version
npm -v
```

# Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md).

# Troubleshooting

#### 1. Errors during installation

Make sure you installed the package with `sudo` and used the  `--unsafe-perm` flag. Most installation errors can be fixed by removing the plugin and reinstalling:

```shell
# cleanup
sudo npm uninstall -g homebridge-config-ui-x

# reinstall
sudo npm install -g --unsafe-perm homebridge-config-ui-x
```

Make sure you are running [supported versions of node and npm](#supported-nodejs-and-npm-versions).

#### 2. Accessories tab missing

If the Accessories tab is not show then you are not running Homebridge in insecure mode. See the [Enabling Accessory Control](https://github.com/oznu/homebridge-config-ui-x/wiki/Enabling-Accessory-Control) wiki for details. If you have just enabled insecure mode make sure you have restarted Homebridge and refreshed the page in your browser.

#### 3. Running in Docker

This plugin supports the [oznu/homebridge](https://github.com/oznu/docker-homebridge) Docker image. You must enable the UI using the method described in [the wiki](https://github.com/oznu/homebridge-config-ui-x/wiki/Enabling-UI-with-Docker).

#### 4. Ask on Discord

Join the [Official Homebridge Discord](https://discord.gg/C87Pvq3) community and ask in the [#ui](https://discord.gg/C87Pvq3) channel.
