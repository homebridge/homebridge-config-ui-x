<p align="center">
  <a href="https://homebridge.io"><img src="https://raw.githubusercontent.com/homebridge/branding/latest/logos/homebridge-color-round-stylized.png" height="140"></a>
</p>
<span align="center">

# Homebridge UI

[![npm](https://badgen.net/npm/v/homebridge-config-ui-x/latest)](https://www.npmjs.com/package/homebridge-config-ui-x)
[![npm](https://badgen.net/npm/dt/homebridge-config-ui-x?label=downloads)](https://www.npmjs.com/package/homebridge-config-ui-x)
[![Discord](https://badgen.net/discord/online-members/C87Pvq3?icon=discord&label=discord)](https://discord.gg/C87Pvq3)
[![Donate](https://badgen.net/badge/donate/paypal/yellow)](https://paypal.me/oznu)

:gb: :de: :fr: :poland: :czech_republic: :ru: :cn: :hungary: :jp: :es: :netherlands: :tr: :it: :bulgaria: :sweden: :norway: :slovenia: :brazil: :portugal: :indonesia: :kr: :macedonia: :thailand: :israel: :ukraine:

</span>

**Homebridge UI** is a web based management tool for [Homebridge](https://github.com/homebridge/homebridge) that allows you to manage all aspects of your Homebridge setup.

- Install and configure Homebridge plugins
- Edit the Homebridge `config.json` with advanced JSON syntax checking and structure validation
- Visual configuration for over 450 plugins (no manual config.json editing required)
- Monitor your Homebridge server via a fully customisable widget-based dashboard
- View the Homebridge logs
- View and control Homebridge accessories
- Restart Homebridge
- Backup and Restore your Homebridge instance
- Set up and manage your Homebridge plugins as [child bridges](https://github.com/homebridge/homebridge/wiki/Child-Bridges)
- and more...

Homebridge UI also provides a tool called [`hb-service`](https://github.com/homebridge/homebridge-config-ui-x/wiki/Homebridge-Service-Command) which makes it easy to set up Homebridge as a service on Linux/Raspbian, macOS and Windows 10.

[![Status](screenshots/homebridge-config-ui-x-darkmode-status.png?2020-01-07)](#usage)

## Installation Instructions

For detailed instructions on how to set up Node.js and Homebridge with Homebridge UI as a service, see the guides on the wiki:

- <img src="https://user-images.githubusercontent.com/3979615/78118327-9853f200-7452-11ea-88aa-5e57ebcf3070.png" alt="homebridge-raspbian-image" height="16px" width="16px"/> [Setup Homebridge using the official Homebridge Raspberry Pi Image](https://github.com/homebridge/homebridge-raspbian-image/wiki/Getting-Started)
- <img src="https://user-images.githubusercontent.com/3979615/59594350-07b45b80-9137-11e9-85fd-e75093ba91a4.png" alt="raspbian" height="16px" width="16px"/> [Setup Homebridge on a Raspberry Pi (Raspbian)](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Raspbian)
- <img src="https://user-images.githubusercontent.com/3979615/59595664-93c78280-9139-11e9-83dc-4d6f9405e788.png" alt="linux" height="16px" width="16px"/> [Setup Homebridge on Debian or Ubuntu Linux](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Debian-or-Ubuntu-Linux)
- <img src="https://user-images.githubusercontent.com/3979615/59593218-e0f52580-9134-11e9-8b77-585755af5d99.png" alt="windows" height="16px" width="16px"/> [Setup Homebridge on Windows 10](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Windows-10)
- <img src="https://user-images.githubusercontent.com/3979615/59594157-b015f000-9136-11e9-93cb-c9d9773ec9e8.png" alt="macos" height="16px" width="16px"/> [Setup Homebridge on macOS](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-macOS)
- <img src="https://user-images.githubusercontent.com/3979615/59594527-56fa8c00-9137-11e9-937b-32092dfcff41.png" alt="docker" height="16px" width="16px"/> [Setup Homebridge using Docker](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Docker)
- <img src="https://user-images.githubusercontent.com/3979615/78118531-dc46f700-7452-11ea-95e5-977f79d1904f.png" alt="synology-dsm" height="16px" width="16px"/> [Setup Homebridge on a Synology NAS](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Synology-DSM)

If your platform is not listed above, or you want to use your own service manager, see the [Manual Configuration](https://github.com/homebridge/homebridge-config-ui-x/wiki/Manual-Configuration) wiki article for instructions on setting up the Homebridge UI to run as a Homebridge plugin instead of a service.

The default username is `admin` and the default password is `admin`.

The UI can be accessed via web browser by default on port `8581` (e.g. `http://localhost:8581`).

## Usage

### Status Screen

This shows an overview of your Homebridge system. The dashboard is widget-based and completely customisable with a number of themes available.

![Status](screenshots/homebridge-config-ui-x-status.png?2020-01-07)

### Plugin Screen

This shows you the currently installed plugins and allows you to install, remove and upgrade plugins.

![Plugin](screenshots/homebridge-config-ui-x-darkmode-plugins.png?2020-01-07)

You can configure supported plugins using the graphical settings editor, removing the need to manually edit the `config.json`. Over 165 popular plugins have implemented support for this feature.

![Plugin Settings](screenshots/homebridge-config-ui-x-darkmode-alexa-settings.png?2020-01-07)

### Configuration Screen

The configuration screen allows you to modify your Homebridge `config.json`. The built-in editor automatically syntax-checks your JSON and makes a backup of your config every time you make a change.

![Config](screenshots/homebridge-config-ui-x-config.png?2020-01-07)

### Log Screen

This shows you the Homebridge rolling log. This is helpful for troubleshooting.

![Log](screenshots/homebridge-config-ui-x-logs.png?2020-01-07)

### Accessories Screen

This shows you the Homebridge accessories for all the Homebridge instances on your network. You can use this to control accessories from a web browser and works well on mobile devices which allows users to control Homebridge from non-Apple devices.

![Accessories](screenshots/homebridge-config-ui-x-accessories.png?2020-01-07)

## Supported Browsers

The following browsers are supported by the Homebridge UI:

- Chrome - latest
- Edge - latest
- Firefox - latest
- Safari - 2 most recent major versions
- iOS - 2 most recent major versions

MS Internet Explorer (any version) is not supported!

## Supported Node.js Version

The Homebridge UI follows the same Node.js support schedule as Homebridge. See the [How-To-Update-Node.js](https://github.com/homebridge/homebridge/wiki/How-To-Update-Node.js) page in the Homebridge wiki for currently supported versions.

You can check your current versions using these commands:

```shell
# check node version
node -v

# check npm version
npm -v
```

## Plugin Development

The https://developers.homebridge.io website contains the Homebridge API reference, available service and characteristic types, and plugin examples.

The [Homebridge Plugin Template](https://github.com/homebridge/homebridge-plugin-template) project provides a base you can use to create your own _platform_ plugin.

There are many existing plugins you can study; you might start with the [Homebridge Example Plugins](https://github.com/homebridge/homebridge-examples) or a plugin that already implements the device type you need.

## Common Issues

### Errors during installation

Make sure you installed the package with `sudo` and used the `--unsafe-perm` flag. Most installation errors can be fixed by removing the Homebridge UI and reinstalling:

```shell
# cleanup
sudo npm uninstall -g homebridge-config-ui-x

# reinstall
sudo npm install -g --unsafe-perm homebridge-config-ui-x
```

Make sure you are running [supported versions of node and npm](#supported-nodejs-and-npm-versions).

### Home App Says Accessory Already Added

To fix this, [Reset Homebridge](https://github.com/homebridge/homebridge/wiki/Connecting-Homebridge-To-HomeKit#how-to-reset-homebridge).

### My iOS App Can't Find Homebridge

Try the following:

1. Swap between the `Bonjour HAP` and `Ciao` mDNS Advertiser options. See [the wiki](https://github.com/homebridge/homebridge/wiki/mDNS-Options) for more details.
2. iOS DNS cache has gone stale or gotten misconfigured. To fix this, turn airplane mode on and back off to flush the DNS cache.

## Community

The official Homebridge Discord server and Reddit community are where users can discuss Homebridge and ask for help.

<span align="center">

[![Homebridge Discord](https://discordapp.com/api/guilds/432663330281226270/widget.png?style=banner2)](https://discord.gg/kqNCe2D) [![Homebridge Reddit](https://raw.githubusercontent.com/homebridge/homebridge/50f91541bc8731ed0c794f1370d9b76f49443d11/.github/homebridge-reddit.svg)](https://www.reddit.com/r/homebridge/)

</span>

HomeKit communities can also be found on both [Discord](https://discord.gg/RcV7fa8) and [Reddit](https://www.reddit.com/r/homekit).

## Limitations

- One bridge can only expose 150 accessories due to a HomeKit limit. You can however run your plugins as a [Child Bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) or run [Multiple Homebridge Instances](https://github.com/oznu/homebridge-config-ui-x/wiki/Homebridge-Service-Command#multiple-instances) to get around this limitation.
- Once an accessory has been added to the Home app, changing its name via Homebridge won't be automatically reflected in iOS. You must change it via the Home app as well.

## Credits

- Homebridge was originally created by [Nick Farina](https://twitter.com/nfarina).
- The original HomeKit API work was done by [Khaos Tian](https://twitter.com/khaost) in his [HAP-NodeJS](https://github.com/homebridge/HAP-NodeJS) project.
- Homebridge UI was originally created by [oznu](https://github.com/oznu).
