[![npm](https://badgen.net/npm/v/homebridge-config-ui-x/latest?icon=npm&label)](https://www.npmjs.com/package/homebridge-config-ui-x)
[![npm](https://badgen.net/npm/dt/homebridge-config-ui-x?label=downloads)](https://www.npmjs.com/package/homebridge-config-ui-x)
[![Discord](https://badgen.net/discord/online-members/C87Pvq3?icon=discord&label=discord)](https://discord.gg/C87Pvq3)
[![Donate](https://badgen.net/badge/donate/paypal/yellow)](https://paypal.me/oznu)

Supported Languages: :gb: :de: :fr: :poland: :czech_republic: :ru: :cn: :hungary: :jp: :es: :netherlands: :tr: :it: :bulgaria: :sweden: :norway: :slovenia: :brazil: :portugal: :indonesia: :kr: :macedonia: :thailand:

# Homebridge Config UI X

[Homebridge Config UI X](https://www.npmjs.com/package/homebridge-config-ui-x) is a web based management tool for [Homebridge](https://github.com/homebridge/homebridge) that allows you to manage all aspects of your Homebridge setup.

* Install and configure Homebridge plugins
* Edit the Homebridge `config.json` with advanced JSON syntax checking and structure validation
* Visual configuration for over 450 plugins (no manual config.json editing required)
* Monitor your Homebridge server via a fully customisable widget-based dashboard
* View the Homebridge logs
* View and control Homebridge accessories
* Restart Homebridge
* Backup and Restore your Homebridge instance
* and more...

Homebridge Config UI X also provides a tool called [`hb-service`](https://github.com/oznu/homebridge-config-ui-x/wiki/Homebridge-Service-Command) which makes it easy to setup Homebridge as a service on Linux/Raspbian, macOS and Windows 10.

[![Status](screenshots/homebridge-config-ui-x-darkmode-status.png?2020-01-07)](#usage)

# Installation Instructions

For detailed instructions on how to setup Node.js and Homebridge with Homebridge Config UI X as a service see the guides on the wiki:

* <img src="https://user-images.githubusercontent.com/3979615/78118327-9853f200-7452-11ea-88aa-5e57ebcf3070.png" alt="homebridge-raspbian-image" height="16px" width="16px"/> [Official Homebridge Raspberry Pi Image](https://github.com/homebridge/homebridge-raspbian-image/wiki/Getting-Started)
* <img src="https://user-images.githubusercontent.com/3979615/59594350-07b45b80-9137-11e9-85fd-e75093ba91a4.png" alt="raspbian" height="16px" width="16px"/> [Raspberry Pi (Raspbian)](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Raspbian)
* <img src="https://user-images.githubusercontent.com/3979615/59595664-93c78280-9139-11e9-83dc-4d6f9405e788.png" alt="linux" height="16px" width="16px"/> [Debian or Ubuntu Linux](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Debian-or-Ubuntu-Linux)
* <img src="https://user-images.githubusercontent.com/3979615/59595664-93c78280-9139-11e9-83dc-4d6f9405e788.png" alt="linux" height="16px" width="16px"/> [Red Hat, CentOS or Fedora Linux](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Red-Hat%2C-CentOS-or-Fedora-Linux)
* <img src="https://user-images.githubusercontent.com/3979615/59594157-b015f000-9136-11e9-93cb-c9d9773ec9e8.png" alt="macos" height="16px" width="16px"/> [macOS](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-macOS)
* <img src="https://user-images.githubusercontent.com/3979615/59593218-e0f52580-9134-11e9-8b77-585755af5d99.png" alt="windows" height="16px" width="16px"/> [Windows 10](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Windows-10)
* <img src="https://user-images.githubusercontent.com/3979615/59594527-56fa8c00-9137-11e9-937b-32092dfcff41.png" alt="docker" height="16px" width="16px"/> [Docker (Linux)](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Docker)
* <img src="https://user-images.githubusercontent.com/3979615/78118531-dc46f700-7452-11ea-95e5-977f79d1904f.png" alt="synology-dsm" height="16px" width="16px"/> [Setup Homebridge on a Synology NAS](https://github.com/oznu/homebridge-syno-spk#how-to-install)

If your platform is not listed above, or you want to use your own service manager, see the [Manual Configuration](https://github.com/oznu/homebridge-config-ui-x/wiki/Manual-Configuration) wiki article for instructions on setting up the Homebridge UI to run as a Homebridge plugin instead of a service.

The default username is `admin` and the default password is `admin`.

# Usage

### Status Screen

This shows an overview of your Homebridge system. The dashboard is widget based and completely customisable with a number of themes available.

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

If the Accessories tab is not shown then you are not running Homebridge in insecure mode. See the [Enabling Accessory Control](https://github.com/oznu/homebridge-config-ui-x/wiki/Enabling-Accessory-Control) wiki for details. If you have just enabled insecure mode make sure you have restarted Homebridge and refreshed the page in your browser.

#### 3. Running in Docker

This plugin supports the [oznu/homebridge](https://github.com/oznu/docker-homebridge) Docker image. You must enable the UI using the method described in [the wiki](https://github.com/oznu/homebridge-config-ui-x/wiki/Enabling-UI-with-Docker).

#### 4. Ask on Discord

Join the [Official Homebridge Discord](https://discord.gg/C87Pvq3) community and ask in the [#ui](https://discord.gg/C87Pvq3) channel.
