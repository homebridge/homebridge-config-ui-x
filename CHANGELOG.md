# Change Log

All notable changes to this project will be documented in this file. This project uses [Semantic Versioning](https://semver.org/).

## 3.5.0

### Notable Changes

* This plugin now runs in a seperate thread to the main homebridge process ([#75](https://github.com/oznu/homebridge-config-ui-x/issues/75))
* Added ability to set a custom image for the login screen using the `loginWallpaper` option ([#34](https://github.com/oznu/homebridge-config-ui-x/issues/34))

## 3.4.1 (2018-04-06)

### Notable Changes

* Added link to plugin homepage (GitHub, BitBucket, etc.) ([#74](https://github.com/oznu/homebridge-config-ui-x/issues/74))
* Updated npm dependencies

### Bug Fixes

* Suppress npm update warnings in log output ([#66](https://github.com/oznu/homebridge-config-ui-x/issues/66))

## 3.4.0 (2018-03-22)

### Notable Changes

* Added Docker Settings page where users can adjust the following ([#64](https://github.com/oznu/homebridge-config-ui-x/pull/64)):
  * Toggle Homebridge Insecure / Debug Mode
  * UI Theme Color
  * UI Auth Mode (Form, Basic, None)
* Added the ability to set the path to the temp file using `HOMEBRIDGE_CONFIG_UI_TEMP` when running in Docker ([#62](https://github.com/oznu/homebridge-config-ui-x/issues/62))

### Bug Fixes

* Log viewer terminal now adjusts the size of the pty shell according to the size of the browser window

## 3.3.1 (2018-03-17)

### Bug Fixes

* Prevent zoom when using the config editor on iOS (@Yanni via Homebridge Slack)
* Prevent the deletion of an admin user if there are no other admin users ([docker-homebridge#83](https://github.com/oznu/docker-homebridge/issues/83))
* Fixed issue that prevented installed plugins from loading if one was missing a description in it's `package.json` ([#59](https://github.com/oznu/homebridge-config-ui-x/issues/59))

## 3.3.0 (2018-03-16)

### Notable Changes

* Added ability for Linux users to shutdown and restart the server Homebridge is running on ([#39](https://github.com/oznu/homebridge-config-ui-x/issues/39))
* Updated npm dependencies

## 3.2.1 (2018-03-13)

### Bug Fixes

* Fixed issue that prevented plugin scan from working on Windows ([#53](https://github.com/oznu/homebridge-config-ui-x/issues/53))
* Fixed missing css class `.bg-yellow`

## 3.2.0 (2018-03-12)

### Notable Changes

* Display plugin `CHANGELOG.md` after updating if it exists ([#51](https://github.com/oznu/homebridge-config-ui-x/issues/51))

### Bug Fixes

* Prevent users accidentally removing homebridge-config-ui-x using the web app

## 3.1.2 (2018-03-11)

### Bug Fixes

* Fixed an issue that prevented adding a new room to the accessories page in Safari ([#47#issuecomment-372101867](https://github.com/oznu/homebridge-config-ui-x/issues/47#issuecomment-372101867))

## 3.1.1 (2018-03-11)

### Bug Fixes

* Fixed missing css class `.bg-red`

## 3.1.0 (2018-03-10)

### Notable Changes

* Added features just for [oznu/homebridge](https://github.com/oznu/docker-homebridge) docker container users ([#48](https://github.com/oznu/homebridge-config-ui-x/pull/48))
  * Ability to access docker container terminal
  * Ability to edit `startup.sh` script
  * Ability to restart entire docker container

## 3.0.1 (2018-03-10)

### Notable Changes

* Updated npm dependencies
* Material Icons now loaded from local package
* Swapped to the core mdbootstrap library to fix nav drop down menus

### Bug Fixes

* The mobile menu will now close when a nav item is clicked

## 3.0.0 (2018-03-08)

### Notable Changes

* Ability to view and control accessories ([#46](https://github.com/oznu/homebridge-config-ui-x/pull/46))
* Scan installed and updated plugins for vulnerabilities and malware ([#37#issuecomment-370698122](https://github.com/oznu/homebridge-config-ui-x/issues/37#issuecomment-370698122))
* Display current version of node and homebridge-config-ui-x on the status page ([#40](https://github.com/oznu/homebridge-config-ui-x/issues/40))
* Set the homebridge title to match the homebridge instance name ([#38](https://github.com/oznu/homebridge-config-ui-x/issues/38))

### Bug Fixes

* Non-admin users now have restricted access ([#37#issuecomment-368346991](https://github.com/oznu/homebridge-config-ui-x/issues/37#issuecomment-368346991))

## 2.7.1 (2018-03-03)

### Bug Fixes

* Ensure log process is killed after closing the page on older linux systems ([#41](https://github.com/oznu/homebridge-config-ui-x/issues/41))

## 2.7.0 (2018-02-21)

### Notable Changes

* Added mobile app icons provided by [@DJay-X](https://github.com/DJay-X) ([#34](https://github.com/oznu/homebridge-config-ui-x/issues/34))

## 2.6.3 (2018-02-18)

### Bug Fixes

* Fixed config screen not displaying correctly on some devices ([#31](https://github.com/oznu/homebridge-config-ui-x/issues/31))

## 2.6.2 (2018-02-17)

### Bug Fixes

* Fixed bug that prevented log file session closing when using sudo mode ([#29](https://github.com/oznu/homebridge-config-ui-x/issues/29))

## 2.6.1 (2018-02-17)

### Bug Fixes

* Use registry.npmjs.org to search for plugins ([#30](https://github.com/oznu/homebridge-config-ui-x/issues/30))