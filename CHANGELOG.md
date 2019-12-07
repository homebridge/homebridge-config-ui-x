# Change Log

All notable changes to this project will be documented in this file. This project uses [Semantic Versioning](https://semver.org/).

## 4.6.5 (2019-12-07)

### Notable Changes

* **i18n:** Norwegian language (no) translation added by [@fmandal](https://github.com/fmandal) ([#420](https://github.com/oznu/homebridge-config-ui-x/pull/420))

### Other Changes

* Updated npm dependencies

## 4.6.4 (2019-11-24)

### Notable Changes

* **Themes:** Dark mode is now darker

### Other Changes

* Updated npm dependencies

## 4.6.3 (2019-10-27)

### Notable Changes

* **Config Editor:** Improved Validation: Config in the `platforms` and `accessories` arrays are now checked to ensure they match the structure expected by Homebridge
* **Auth:** If the `auth.json` file is corrupted or empty it will be recreated with the default credentials

### Bug Fixes

* **i18n:** Swedish language improvements ([#410](https://github.com/oznu/homebridge-config-ui-x/pull/410))

### Other Changes

* Updated npm dependencies

## 4.6.2 (2019-10-08)

### Notable Changes

* **Theme:** Added new "Default" theme, the default theme will automatically switch between a "Light Mode" theme (Teal) and a "Dark Mode" theme based on the client operating system's dark mode preferences
* **i18n:** Swedish language translation added by [@DewGew](https://github.com/DewGew) ([#404](https://github.com/oznu/homebridge-config-ui-x/pull/404))

### Bug Fixes

* **i18n:** German language improvements ([#365](https://github.com/oznu/homebridge-config-ui-x/pull/365), [#388](https://github.com/oznu/homebridge-config-ui-x/pull/388))
* **i18n:** Polish language improvements ([#395](https://github.com/oznu/homebridge-config-ui-x/pull/395))
* **i18n:** French language improvements ([#400](https://github.com/oznu/homebridge-config-ui-x/pull/400))
* **System:** Perform self-updates offline when using Docker - latest [oznu/homebridge](https://github.com/oznu/docker-homebridge) docker image required ([docker-homebridge#220](https://github.com/oznu/docker-homebridge/issues/220))

## 4.6.1 (2019-08-24)

### Bug Fixes

* **Theme:** Improved visibility of user profiles in the new dark mode theme ([#363](https://github.com/oznu/homebridge-config-ui-x/issues/363))
* **Accessory Control:** Fix an issue causing errors when discovering instances in some circumstances ([#370](https://github.com/oznu/homebridge-config-ui-x/issues/370))
* **i18n:** Bulgarian language improvements ([#364](https://github.com/oznu/homebridge-config-ui-x/issues/364))
* **i18n:** German language improvements ([#365](https://github.com/oznu/homebridge-config-ui-x/pull/365))

## 4.6.0 (2019-08-16)

### New Features

* **Plugins:** Added support for configuring the new [Homebridge Google Smart Home Plugin](https://github.com/oznu/homebridge-gsh). This plugin allows you to control supported Homebridge accessories from any Google Home Smart Speaker, Google Assistant, or the Google Home mobile app on iOS and Android
* **Accessory Control:** Multi-instance support. You can now control accessories from multiple Homebridge instances
  * All instances you want to control must have the same PIN, be on the same network, and running in insecure mode
  * Your other instances are automatically discovered, however you can blacklist instances you don't want to control using the plugin settings
  * Due to the changes required to identify accessories across multiple instances your room/accessory layout will be reset after upgrading
* **System:** Added a new feature to help setup and run Homebridge and Homebridge Config UI X as a service on Windows 10

### Notable Changes

* **Plugins:** The "last updated" date is now displayed when searching for plugins to install ([#336](https://github.com/oznu/homebridge-config-ui-x/pull/336))
* **Logs:** Increased the default number of lines to show for the "Log from File" method from 200 to 500 ([#339](https://github.com/oznu/homebridge-config-ui-x/issues/339))
* **Accessory Control:** Accessory tiles now animate when clicked/pressed, similar to how they behave in the native iOS Home app
* **Accessory Control:** Accessory characteristics (on, off, brightness etc) now update immediately when changed in HomeKit (previously there was up to a 3 second delay)
* **i18n:** Bulgarian language translation added by [@mafyata](https://github.com/mafyata)
* **i18n:** Added translation support for accessory states and labels ([#342](https://github.com/oznu/homebridge-config-ui-x/pull/342))
  * If you're still seeing English labels, we need your help translating the new values for your language, [get started here](https://github.com/oznu/homebridge-config-ui-x/tree/master/ui/src/i18n)
* **Theme:** The dark mode theme has received a makeover, if you prefered the old dark mode you can switch back in the plugin settings

### Bug Fixes

* **i18n:** Improve German Translations ([#328](https://github.com/oznu/homebridge-config-ui-x/pull/328))
* **i18n:** Improve Polish Translations ([#328](https://github.com/oznu/homebridge-config-ui-x/pull/338))
* **i18n:** The Restart Homebridge page is now translated again ([#342#issuecomment-519499941](https://github.com/oznu/homebridge-config-ui-x/issues/342#issuecomment-519499941))
* **Auth:** Disable auto-capitalization for username fields on mobile browsers ([#325](https://github.com/oznu/homebridge-config-ui-x/pull/325))
* **Accessory Control:** Fixed bug preventing switches correctly reflecting their state when on ([#343](https://github.com/oznu/homebridge-config-ui-x/pull/343))
* **Accessory Control:** Removed outline around modal close buttons ([#349](https://github.com/oznu/homebridge-config-ui-x/pull/349))
* Fixed a bug that prevented the UI automatically reloading after an update

### Other Changes

* Updated npm dependencies
* Upgraded Angular from v8.0.0 to v8.2.0

## 4.5.1 (2019-06-14)

### Bug Fixes

* Fixed a display issues on iOS ([#322](https://github.com/oznu/homebridge-config-ui-x/issues/322))
* Fixed an issue causing users to be logged out before their session had expired

## 4.5.0 (2019-06-12)

### Notable Changes

* **Accessory Control:** Added basic support for "Window Covering" accessories ([#224](https://github.com/oznu/homebridge-config-ui-x/issues/224))
* **Accessory Control:** Added basic support for "Television" accessories: on, off, current input display ([#47#issuecomment-479768040](https://github.com/oznu/homebridge-config-ui-x/issues/47#issuecomment-479768040))
* **Accessory Control:** Added support for "Contact Sensor" accessories ([#47#issuecomment-437576223](https://github.com/oznu/homebridge-config-ui-x/issues/47#issuecomment-437576223))

### Other Changes

* Updated npm dependencies
* Upgraded Angular from v7.2.15 to v8.0.0
* The footer links on the status page are now stuck to the bottom of the page, rather than the end of the content
* Update Content Security Policy to allow remote images from `https://user-images.githubusercontent.com` in plugin Change Logs / Release Notes

## 4.4.5 (2019-06-02)

### Bug Fixes

* Fixed a bug that caused the UI to stop responding for some users ([#299](https://github.com/oznu/homebridge-config-ui-x/issues/299))

### Other Changes

* Updated npm dependencies

## 4.4.4 (2019-05-30)

### Other Changes

* **Config Editor:** Prevent *Smart Punctuation* autocorrect in the config editor on mobile devices ([#313](https://github.com/oznu/homebridge-config-ui-x/issues/313))

## 4.4.3 (2019-05-28)

### Notable Changes

* **Auth:** Ensure the JWT token was generated by the current instance of the UI, if not clear the token and logout ([#307](https://github.com/oznu/homebridge-config-ui-x/issues/307))

### Other Changes

* Add an on-screen warning when attempting to install/update/uninstall a plugin, or view the logs on unsupported versions of Node.js ([#305](https://github.com/oznu/homebridge-config-ui-x/issues/305))
* Added some more detailed log message to help when users are not able to login, need to reset their password, are unable to view accessories

## 4.4.2 (2019-05-19)

### Other Changes

* **Plugins:** Added extra logging to try and investigate the cause of [#299](https://github.com/oznu/homebridge-config-ui-x/issues/299)
* Provide a more detailed error with steps to resolve if the `node-pty` module fails to load (after a Node.js update for example)
* Added a warning message in the logs letting the user know if their Node.js version is to low (anything less than 8.15.1)
* Updated npm dependencies

## 4.4.1 (2019-05-16)

### Notable Changes

* Node.js v12 is now supported ([#277](https://github.com/oznu/homebridge-config-ui-x/issues/277))
* **Plugins:** Added a check before a plugin is installed to test for write access to the target directory if sudo mode is not enabled - this should result in a more helpful message being displayed when a plugin fails to install due to lack of permissions
* **Docker:** Ensure the node_modules directory is present after all plugins are uninstalled

### Other Changes

* Updated npm dependencies

## 4.4.0 (2019-05-07)

### Notable Changes

* **Plugins:** Allow plugins to specify only a single config block should exist in the Plugin Setting GUI ([#290](https://github.com/oznu/homebridge-config-ui-x/issues/290))
* **Plugins:** The plugin will no longer log with timestamps when homebridge is started with `-T` ([#288](https://github.com/oznu/homebridge-config-ui-x/issues/288))
* **Plugins:** The plugin logs are now prefixed with the name defined in the `config.json` ([#288](https://github.com/oznu/homebridge-config-ui-x/issues/288))
* **Auth:** Display a warning if the time on the server varies to greatly from time on the client which could cause mysterious login issues

### Bug Fixes

* **Plugins:** Fixed a bug preventing users adding additional elements to an array with the Plugin Setting GUI ([#289](https://github.com/oznu/homebridge-config-ui-x/issues/289))
* **Plugins:** Fixed an issue preventing the plugins tab from loading when the npm registry was slow to respond ([#284](https://github.com/oznu/homebridge-config-ui-x/issues/284))
* **Plugins:** Fixed an issue that prevented plugins from displaying for some users ([#284](https://github.com/oznu/homebridge-config-ui-x/issues/284))
* **Plugins:** Searching for the exact name of a plugin will return a result even if the [npm registry search is not working](https://status.npmjs.org/incidents/qg46dsfk1vt2)

### Other Changes

* Updated npm dependencies
* Bundle some dependencies using `bundledDependencies` in the `package.json` to try and reduce installation errors

## 4.3.0 (2019-05-05)

### Notable Changes

* **Homebridge:** Added `homebridgePackagePath` to allow users to defined where the Homebridge module is installed if it's not installed globally ([#280](https://github.com/oznu/homebridge-config-ui-x/issues/280))

### Other Changes

* Updated npm dependencies
* **Wiki**: Created [wiki page](https://github.com/oznu/homebridge-config-ui-x/wiki/Config-Options) showing all available config options

## 4.2.0 (2019-05-03)

### Notable Changes

* **Plugins:** Plugins that need updating are now correctly displayed at the top of the list ([#275](https://github.com/oznu/homebridge-config-ui-x/issues/275))
* **Plugins:** The status/homepage will now display a notice if you have any out-of-date plugins ([#200](https://github.com/oznu/homebridge-config-ui-x/issues/200))
* **Config:** The "Backup Config" feature is back ([#279](https://github.com/oznu/homebridge-config-ui-x/issues/279))

## 4.1.0 (2019-04-28)

### Notable Changes

* **i18n:** Italian language translation added by [@cyberfafu](https://github.com/cyberfafu)

### Other Changes

* Updated npm dependencies

## 4.0.6 (2019-04-22)

### Bug Fixes

* Fixed issue causing the UI to crash when `platforms` was not present in the Homebridge `config.json` ([#263](https://github.com/oznu/homebridge-config-ui-x/issues/263))

### Other Changes

* Updated npm dependencies

## 4.0.5 (2019-04-21)

### Bug Fixes

* Fixed issue preventing the web service from loading correctly in config-less [oznu/homebridge](https://github.com/oznu/docker-homebridge) docker containers ([#262](https://github.com/oznu/homebridge-config-ui-x/issues/262))

## 4.0.4 (2019-04-20)

### Bug Fixes

* Check for IPv6 interfaces before attempting to listen on `::` ([#261](https://github.com/oznu/homebridge-config-ui-x/issues/261))

### Other Changes

* Added `host` config option to allow users to manually specify which interface/ip address the web interface should listen on

## 4.0.3 (2019-04-20)

### Bug Fixes

* Fixed bug that prevented the web service listening on IPv6 interfaces ([#260](https://github.com/oznu/homebridge-config-ui-x/issues/260))

## 4.0.2 (2019-04-19)

### Notable Changes

* Added `websocketCompatibilityMode` option for users who are having issues with WebSocket connections ([#238](https://github.com/oznu/homebridge-config-ui-x/issues/238))

### Other Changes

* Updated npm dependencies

## 4.0.1 (2019-04-17)

### Bug Fixes

* Fixed resolving of custom plugin path for non-Docker installations

## 4.0.0 (2019-04-16)

### Breaking Changes

* **Auth:** The Basic Authentication option has been removed. Users who have Basic Authentication enabled will be swapped to Form Authentication
* **Reverse Proxy:** Some users who have setup a reverse proxy and defined the websocket path will need to swap the WebSocket endpoint from `/wsocket` to `/socket.io`
  * *If you are using the reverse proxy templates from the [wiki](https://github.com/oznu/homebridge-config-ui-x/wiki/) no changes are required*
* **Node.js Version:** Dropping support for Node 7 and below, this plugin now requires Node.js v8.15.1 or higher on Linux and v10 or higher on Windows

### Notable Changes

* **Plugins:** Before updating a Homebridge plugin the release notes from GitHub will be shown where possible ([#233](https://github.com/oznu/homebridge-config-ui-x/issues/233))
* **Plugins:** A corrupt plugin will no longer prevent all the installed plugins from being displayed ([#252](https://github.com/oznu/homebridge-config-ui-x/issues/252))
* **i18n:** Turkish language translation added by [@btutal](https://github.com/btutal)
* **Theme:** The default theme for new installs is now `teal` instead of `red`
* **Auth:** Ability to customise the session timeout
* **System:** Added the ability for the plugin to run as a separate service rather than a Homebridge plugin, this will allow users who have configured this feature to manage their server even if Homebridge is crashing due to a bad config / other issue
  * Previously this has only been supported, and the default setup, when running in Docker ([oznu/homebridge](https://github.com/oznu/docker-homebridge))

### Other Changes

* The code base has been refactored
* Client side changes include:
  * Swapped from `ui-router` to `@angular/router` for page routing
  * Now using `socket.io` for WebSockets
  * Split code into modules
  * Lazy load modules on demand
* Server side changes include:
  * Swapped from Express to the [Nest.js](https://nestjs.com/) framework with Fastify
  * Swapped from `ws` to `socket.io` for WebSockets - while I do prefer to use the `ws` library, the syntastic sugar provided by Socket.io simplified the code base
  * Split code into modules
  * Packaged code is now combined with Webpack, this should reduce startup times on slow I/O systems like the Raspberry Pi

## 3.11.0 (2019-04-03)

### Notable Changes

* **Auth:** The Basic Authentication option has been depreciated. Users should switch to Form Authentication instead (the default)

### Other Changes

* Swap to using a prebuilt version of the node-pty package to try and reduce errors during installation
* Updated other npm dependencies

## 3.10.0 (2019-03-23)

### Notable Changes

* **Themes:** Dark mode and other themes added by [@RaymondMouthaan](https://github.com/RaymondMouthaan) ([#236](https://github.com/oznu/homebridge-config-ui-x/pull/236))
* **Themes:** Make it easier to see that there are three separate links at the bottom of ths status page by adding hover effect ([#230](https://github.com/oznu/homebridge-config-ui-x/issues/230))


## 3.9.7 (2019-03-16)

### Notable Changes

* **i18n:** Dutch language translation added by [@RaymondMouthaan](https://github.com/RaymondMouthaan)

### Other Changes

* Updated Angular to 7.2.9
* Updated other npm dependencies

## 3.9.6 (2019-02-04)

### Notable Changes

* **i18n:** Spanish language translation added by [@Rubenfer](https://github.com/Rubenfer)

## 3.9.5 (2019-02-02)

### Notable Changes

* **i18n:** Japanese language translation added by [@gaojie429](https://github.com/gaojie429)

### Other Changes

* Updated Angular from 7.2.0 -> 7.2.3
* Updated other npm dependencies

## 3.9.4 (2019-01-15)

### Other Changes

* Updated `xterm` dependency to fix [CVE-2019-0542](https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2019-0542)
* Updated Angular from 7.1.0 -> 7.2.0
* Updated other npm dependencies

## 3.9.3 (2019-01-05)

### Notable Changes

* **i18n:** Improvements to Polish language translation ([#192](https://github.com/oznu/homebridge-config-ui-x/pull/192))
* **i18n:** Improvements to Simplified Chinese language translations ([#195](https://github.com/oznu/homebridge-config-ui-x/pull/195))
* **Accessory Control:** Added ability to lock the accessory layout ([#197](https://github.com/oznu/homebridge-config-ui-x/issues/197))

## 3.9.2 (2018-12-18)

### Notable Changes

* **i18n:** Improvements to Polish language translation ([#186](https://github.com/oznu/homebridge-config-ui-x/pull/186))
* **i18n:** Hungarian language translation added by Nagy Attila
* **i18n:** Traditional Chinese language translation added by [@r951236958](https://github.com/r951236958)
* **i18n:** Improved i18n capabilities to support both Simplified and Traditional Chinese translations

### Bug Fixes

* Fixed a bug that prevented errors being handled correctly by the client

## 3.9.1 (2018-12-03)

### Notable Changes

* **i18n:** Improvements to German language translation ([#174](https://github.com/oznu/homebridge-config-ui-x/pull/174))
* **Auth:** Fixed bug preventing login when credentials were autofilled in Chrome ([#175](https://github.com/oznu/homebridge-config-ui-x/issues/175))
* **Plugins:** Prevent invalid link to plugin homepage being displayed if the URL is not known ([#178](https://github.com/oznu/homebridge-config-ui-x/issues/178))

### Other Changes

* Updated Angular from 6.1.9 to 7.1.1
* Updated npm dependencies

## 3.9.0 (2018-11-03)

### Notable Changes

* **Accessory Control:** Added ability for accessories to be assigned custom names; right click to access the accessory config/info panel ([#156](https://github.com/oznu/homebridge-config-ui-x/issues/156))
* **Accessory Control:** Added ability for accessories to be hidden ([#84](https://github.com/oznu/homebridge-config-ui-x/issues/84))
* **i18n:** Improvements to French language translation ([#169](https://github.com/oznu/homebridge-config-ui-x/pull/169))

### Other Changes

* **Auth:** removed some unnecessary log messages ([#171](https://github.com/oznu/homebridge-config-ui-x/issues/171))
* Updated npm dependencies

## 3.8.11 (2018-10-06)

### Notable Changes

* **i18n:** Improvements to French language translation ([#162](https://github.com/oznu/homebridge-config-ui-x/pull/162))

### Other Changes

* Updated Angular to 6.1.9
* Updated npm dependencies

## 3.8.10 (2018-09-04)

### Notable Changes

* **i18n:** Simplified Chinese language translation added by [@niinaranpo](https://github.com/niinaranpo)

### Other Changes

* Updated Angular to 6.1.6
* Updated npm dependencies

## 3.8.9 (2018-08-06)

### Bug Fixes

* **i18n:** Improve Russian Translations ([#146](https://github.com/oznu/homebridge-config-ui-x/pull/146))

### Other Changes

* Updated Angular to 6.1.1
* Updated npm dependencies

## 3.8.8 (2018-07-30)

### Notable Changes

* **i18n:** Czech language translation added by [@HonzaaD](https://github.com/HonzaaD)
* **i18n:** Russian language translation added by [@Caribsky](https://github.com/Caribsky)
  * User contributions to the non-english translations are always welcome, [click here](https://github.com/oznu/homebridge-config-ui-x/blob/master/CONTRIBUTING.md#contributing-to-translations) for details on how you can help

### Bug Fixes

* **Config Editor:** Backup button actually downloads up the `config.json` now ([#144](https://github.com/oznu/homebridge-config-ui-x/issues/144))
* **Config Editor:** Fixed issued using config editor on mobile devices ([#131](https://github.com/oznu/homebridge-config-ui-x/issues/131))
* **Accessory Control:** Accessory layout changes are now persistent again

## 3.8.7 (2018-07-28)

### Notable Changes

* **Accessory Control:** Long-clicking a lightbulb with no additional characteristics (eg. brightness) no longer opens a modal ([#47#issuecomment-405089113](https://github.com/oznu/homebridge-config-ui-x/issues/47#issuecomment-405089113))
* **Accessory Control:** Right-clicking an accessory on a non-mobile device will bring up a modal showing all accessory characteristics and other information
* **i18n:** Polish language translation added by [@mientki](https://github.com/mientki)
  * User contributions to the non-english translations are always welcome, [click here](https://github.com/oznu/homebridge-config-ui-x/blob/master/CONTRIBUTING.md#contributing-to-translations) for details on how you can help

## 3.8.6 (2018-07-27)

### Bug Fixes

* **Config Editor:** Backup button more reliable ([#135](https://github.com/oznu/homebridge-config-ui-x/issues/135))
* **Accessory Control:** Refresh all accessories when one is changed to ensure the dashboard is up-to-date ([#136](https://github.com/oznu/homebridge-config-ui-x/issues/136))

### Other Changes

* Updated Angular to 6.1.0
* Updated npm dependencies

## 3.8.5 (2018-06-15)

### Bug Fixes

* Handle loading config schema for [@homebridge](https://www.npmjs.com/org/homebridge) plugins correctly

## 3.8.4 (2018-06-14)

### Notable Changes

* Made `config.json` saves a bit more robust in an attempt to fix ([#122](https://github.com/oznu/homebridge-config-ui-x/issues/122))
* Added `proxyHost` config option to make running behind a reverse proxy easier ([#119](https://github.com/oznu/homebridge-config-ui-x/issues/119))

## 3.8.3 (2018-06-07)

### Notable Changes

* Fixes to German Translation ([#116](https://github.com/oznu/homebridge-config-ui-x/pull/116))
* Allow web terminal access on Linux-based hosts *only* if a certain environment variable is set ([#110](https://github.com/oznu/homebridge-config-ui-x/issues/110))
  * Homebridge must be running with the `HOMEBRIDGE_CONFIG_UI_TERMINAL=1` environment variable to access the terminal

## 3.8.2 (2018-06-06)

### Other Changes

* Minor bug fixes
* Updated npm dependencies

## 3.8.0 (2018-06-03)

### Notable Changes

* Added support for non-english translations ([#102](https://github.com/oznu/homebridge-config-ui-x/issues/102))
  * German translation added with the assistance of [@razer4908](https://github.com/razer4908)
  * French translation added by [@the0neyouseek](https://github.com/the0neyouseek) ([#105](https://github.com/oznu/homebridge-config-ui-x/pull/105))
  * Language is selected automatically based on browser settings
  * If you want to contribute to the translation work please see [CONTRIBUTING.md](https://github.com/oznu/homebridge-config-ui-x/blob/master/CONTRIBUTING.md#contributing-to-translations)
* Imperial display units now apply to temperature sensors and thermostat accessories ([#96](https://github.com/oznu/homebridge-config-ui-x/issues/96))

### Other Changes

* Updated npm dependencies
* Config changes for the UI should require a full page refresh less often

## 3.7.0 (2018-05-31)

### Notable Changes

* Added support for imperial temperature display units ([#96](https://github.com/oznu/homebridge-config-ui-x/issues/96))

## 3.6.6 (2018-05-26)

### Notable Changes

* **ui**: upgraded from Angular 5.x to 6.x
* updated npm dependencies

## 3.6.5 (2018-05-20)

### Notable Changes

* Updated npm dependencies

## 3.6.3 (2018-05-10)

### Notable Changes

* Removed the `nsp` package as the tool has been discontinued, vulnerability scanning is being added to `npm` natively
* Updated npm dependencies

## 3.6.2 (2018-05-09)

### Other Changes

* Updated npm dependencies
* Errors will no longer be thrown if a plugin is installed with CVSS alerts lower than 4 (Low Risk)

## 3.6.1 (2018-05-08)

### Bug Fixes

* Fixed bug that could cause plugins that take a long time to install or upgrade to fail

## 3.6.0 (2018-05-08)

### Notable Changes

* **Beta Feature**: Initial implementation of GUI/form based setup for supported plugins
* Added support for optional native HTTPS / SSL ([#68](https://github.com/oznu/homebridge-config-ui-x/issues/68), [#35](https://github.com/oznu/homebridge-config-ui-x/issues/35))
* The Log Viewer config options have changed, existing options have been have depreciated, see [README](https://github.com/oznu/homebridge-config-ui-x#log-viewer-configuration) for details
* Docker users may now configure this plugin using the `config.json` or the new plugin GUI/form config method
* Added metadata tag allow using plugin as a full screen web app on iOS ([#88](https://github.com/oznu/homebridge-config-ui-x/issues/88))
* Added ability to restore and cleanup `config.json` backups ([#77](https://github.com/oznu/homebridge-config-ui-x/issues/77))

### Other Changes

* Added [Content-Security-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP) headers
* Links to external sites now have `rel="noopener noreferrer"`
* Links in plugin-author generated markdown (eg. change logs, plugin config) are now opened in a new tab
* When on the status page, the browser will refresh automatically if the client version does not match the server version
* Updated npm dependencies

### Bug Fixes

* Fixed bug that caused homebridge to crash when using Log Viewer on Windows 10

## 3.5.5 (2018-04-21)

### Bug Fixes

* Ensure forked process is killed if Homebridge is not running in a different way (@Damien via Slack & [#86](https://github.com/oznu/homebridge-config-ui-x/issues/86))

## 3.5.4 (2018-04-19)

### Notable Changes

* Added `wsocket` prefix to websocket connection to make reverse proxying easier for some users ([#85](https://github.com/oznu/homebridge-config-ui-x/issues/85))

## 3.5.3 (2018-04-16)

### Bug Fixes

* Fixed bug that could prevent the plugin from displaying in the browser after an update unless the cache was cleared ([#82](https://github.com/oznu/homebridge-config-ui-x/issues/82))
* Ensure forked process is killed if Homebridge is not running ([#83](https://github.com/oznu/homebridge-config-ui-x/issues/83))

## 3.5.2 (2018-04-15)

### Notable Changes

* Accessory Control: Added message explaining that accessory control is disabled when navigating to `/accessories` when insecure mode is not enabled
* Updated README to contain link to the [Enabling Accessory Control](https://github.com/oznu/homebridge-config-ui-x/wiki/Enabling-Accessory-Control) wiki article

## 3.5.1 (2018-04-12)

### Bug Fixes

* Docker: Fixed a bug that prevented users saving settings

## 3.5.0 (2018-04-12)

### Notable Changes

* This plugin now runs in a seperate thread to the main homebridge process ([#75](https://github.com/oznu/homebridge-config-ui-x/issues/75))
  * This can be disabled by setting `noFork` to `true` in the plugin config
* Added ability to set a custom image for the login screen using the `loginWallpaper` option ([#34](https://github.com/oznu/homebridge-config-ui-x/issues/34))
* Updated npm dependencies

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