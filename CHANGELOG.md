# Change Log

All notable changes to this project will be documented in this file. This project uses [Semantic Versioning](https://semver.org/).

## 4.37.0 (2021-01-30)

### Notable Changes

* **i18n:** Macedonian (mk) language added by [@dimovskidamjan](https://github.com/dimovskidamjan) ([#1011](https://github.com/oznu/homebridge-config-ui-x/pull/1011))
  * The Homebridge UI is now available in 24 different languages!
* **Plugins:** The following features have been added to assist plugin developers building [custom plugin user interfaces](https://github.com/homebridge/plugin-ui-utils):
  * Added an option to retrive a list of cached accessories for the plugin using the `homebridge.getCachedAccessories` method

### Other Changes

* **i18n:** Improvements to Portuguese language translations ([#1014](https://github.com/oznu/homebridge-config-ui-x/pull/1014),[#1034](https://github.com/oznu/homebridge-config-ui-x/pull/1034),[#1038](https://github.com/oznu/homebridge-config-ui-x/pull/1038))
* **i18n:** Improvements to Polish language translations ([#1032](https://github.com/oznu/homebridge-config-ui-x/pull/1032),[#1036](https://github.com/oznu/homebridge-config-ui-x/pull/1036))
* **i18n:** Improvements to French language translations ([#1035](https://github.com/oznu/homebridge-config-ui-x/pull/1035),[#1037](https://github.com/oznu/homebridge-config-ui-x/pull/1037))
* **i18n:** Improvements to Catalan language translations ([#1042](https://github.com/oznu/homebridge-config-ui-x/pull/1042))
* **i18n:** Improvements to Spanish language translations ([#1039](https://github.com/oznu/homebridge-config-ui-x/pull/1039))
* **i18n:** Improvements to Turkish language translations ([#1041](https://github.com/oznu/homebridge-config-ui-x/pull/1041))
* **i18n:** Improvements to Traditional Chinese language translations ([#1045](https://github.com/oznu/homebridge-config-ui-x/pull/1045))

### Bug Fixes

* **Dashboard:** The battery accessory type is now correctly displayed in the Accessories widget ([#998](https://github.com/oznu/homebridge-config-ui-x/issues/998))

### Homebridge v1.3.0 Features

These features will appear in once Homebridge v1.3.0 or later is installed (currently in beta):

* **Homebridge:** Added the ability to swap between the `ciao` and `bonjour-hap` mdns advertisers.
* **Plugins:** Added the ability to disable plugins without having to uninstall them or remove their config from the Homebridge `config.json` file ([#287](https://github.com/oznu/homebridge-config-ui-x/issues/287),[#790](https://github.com/oznu/homebridge-config-ui-x/issues/790),[#791](https://github.com/oznu/homebridge-config-ui-x/issues/791),[#864](https://github.com/oznu/homebridge-config-ui-x/issues/864),[#931](https://github.com/oznu/homebridge-config-ui-x/issues/931),[#990](https://github.com/oznu/homebridge-config-ui-x/issues/990),[#1029](https://github.com/oznu/homebridge-config-ui-x/issues/1029))


## 4.36.0 (2020-12-07)

### Notable Changes

* **Homebridge:** Users running Homebridge v1.2.x will now be prompted to update to [Homebridge v1.2.4](https://github.com/homebridge/homebridge/releases/tag/v1.2.4)

### Other Changes

* **i18n:** Improvements to Japanese language translations ([#980](https://github.com/oznu/homebridge-config-ui-x/pull/980))

### Bug Fixes

* **Auth:** Fix an issue that prevented the "Login" button from being enabled when auto filling credentials on iOS ([#993](https://github.com/oznu/homebridge-config-ui-x/pull/993))

## 4.35.0 (2020-11-30)

### Notable Changes

* **i18n:** Korean (ko) language added by [@thankee](https://github.com/thankee) ([#976](https://github.com/oznu/homebridge-config-ui-x/pull/976))
  * The Homebridge UI is now available in 23 different languages!

### Other Changes

* **i18n:** Improvements to Japanese language translations ([#978](https://github.com/oznu/homebridge-config-ui-x/pull/978))

### Bug Fixes

* **Plugins:** [Custom plugin user interfaces](https://github.com/homebridge/plugin-ui-utils) now work correctly in older browsers that do not support the `EventTarget` constructor
* **Plugins:** Ensure `@eaDir` folders are removed from the `/homebridge/node_modules` folder when running with Docker on Synology DSM ([#970](https://github.com/oznu/homebridge-config-ui-x/issues/970))
* **Plugins:** Attempt to automatically clear the npm cache if a UI update fails ([#923](https://github.com/oznu/homebridge-config-ui-x/issues/923))
* **System:** Lockdown the systeminformation dependency version ([#969](https://github.com/oznu/homebridge-config-ui-x/issues/969))

## 4.34.0 (2020-11-20)

### Notable Changes

* **Plugins:** (BETA) Plugin developers building [custom plugin user interfaces](https://github.com/homebridge/plugin-ui-utils) can now create arbitrary standalone forms using a schema - [see docs](https://github.com/homebridge/plugin-ui-utils#homebridgecreateform)

### Other Changes

* **i18n:** Improvements to Simplified Chinese language translations ([#952](https://github.com/oznu/homebridge-config-ui-x/pull/952))
* **i18n:** Improvements to Catalan language translations ([#953](https://github.com/oznu/homebridge-config-ui-x/pull/953))
* **i18n:** Improvements to French language translations ([#955](https://github.com/oznu/homebridge-config-ui-x/pull/955))
* **i18n:** Improvements to Italian language translations ([#957](https://github.com/oznu/homebridge-config-ui-x/pull/957))
* **i18n:** Improvements to Polish language translations ([#962](https://github.com/oznu/homebridge-config-ui-x/pull/962))

### Bug Fixes

* **Backup/Restore:** Ensure the UI is restarted along with the bridge after restoring a backup regardless of how the user triggers a restart ([#963](https://github.com/oznu/homebridge-config-ui-x/pull/963))

## 4.33.0 (2020-11-15)

### Notable Changes

* **Accessory Control:** [@Feilner](https://github.com/Feilner) added support for **Door** and **Window** accessory control in the UI ([#945](https://github.com/oznu/homebridge-config-ui-x/pull/945))
* **Accessory Control:** [@Feilner](https://github.com/Feilner) added accessory icons for Stateless Programmable Switches ([#951](https://github.com/oznu/homebridge-config-ui-x/pull/951))
* **Plugins:** (BETA) The following features have been added to assist plugin developers building [custom plugin user interfaces](https://github.com/homebridge/plugin-ui-utils):
  * Added an option to toggle the display of the schema-generated config form below the plugin's custom user interface - [see docs](https://github.com/homebridge/plugin-ui-utils#homebridgeshowschemaform)
  * Added the ability to load the plugin's custom ui from a local development server (such as the Angular/Vue/Webpack dev servers) - [see docs](https://github.com/homebridge/plugin-ui-utils/blob/master/DEVELOPMENT.md)
  * Added the ability to customise the location of the plugin's custom ui assets using the `customUiPath` property in the `config.schema.json`

### Other Changes

* **i18n:** Improvements to Simplified Chinese language translations ([#942](https://github.com/oznu/homebridge-config-ui-x/pull/942))
* **i18n:** Improvements to German language translations ([#946](https://github.com/oznu/homebridge-config-ui-x/pull/946))
* **i18n:** Improvements to Spanish language translations ([#950](https://github.com/oznu/homebridge-config-ui-x/pull/950))
* **API**: Added REST API endpoints to lookup and update the config for a single plugin, see the [Swagger API documentation](https://github.com/oznu/homebridge-config-ui-x/wiki/API-Reference) for details
* **System**: Display a warning in the UI when the client (browser) is running a newer version than the server - this can happen if the service is not restarted after updating the Homebridge UI 

## 4.32.0 (2020-11-06)

### Notable Changes

* **Plugins:** (BETA) Added the ability for plugin developers to create fully custom configuration user interfaces for their plugins
  * This is an optional feature developers can use if they need more advanced functionality than the current config.schema.json generated form provides
  * Developers can use standard HTML / CSS and JavaScript (or even a front end framework like Vue, Angular or React) to build their user interfaces
  * Developers can also create a server-side script which accepts requests from their plugin user interface
  * See [the documentation](https://github.com/homebridge/plugin-ui-utils#readme) for further information
* **Homebridge:** Added the ability to select which interfaces Homebridge should advertise and listen on (this feature will appear in *Homebridge Settings* when the upcoming release of Homebridge v1.3.0 is installed)

### Bug Fixes

* **Themes:** When using dark mode, `readonly` inputs in a Plugin's Settings GUI are now distinguishable from editable inputs 

### Other Changes

* **Backup/Restore:** Added the [`scheduledBackupDisable`](https://github.com/oznu/homebridge-config-ui-x/wiki/Config-Options#scheduledbackupdisable) option to allow users to disable the automated daily instance backups ([#938](https://github.com/oznu/homebridge-config-ui-x/issues/938))
* **i18n:** Improvements to Catalan language translations ([#919](https://github.com/oznu/homebridge-config-ui-x/pull/919))
* **i18n:** Improvements to Simplified Chinese language translations ([#927](https://github.com/oznu/homebridge-config-ui-x/pull/927),[#936](https://github.com/oznu/homebridge-config-ui-x/pull/936))
* **i18n:** Improvements to Italian language translations ([#928](https://github.com/oznu/homebridge-config-ui-x/pull/928))
* **i18n:** Improvements to Polish language translations ([#929](https://github.com/oznu/homebridge-config-ui-x/pull/929),[#935](https://github.com/oznu/homebridge-config-ui-x/pull/935))
* **i18n:** Improvements to French language translations ([#937](https://github.com/oznu/homebridge-config-ui-x/pull/937))
* **i18n:** Improvements to Spanish language translations ([#939](https://github.com/oznu/homebridge-config-ui-x/pull/939))

## 4.31.0 (2020-10-28)

### Notable Changes

* **Backup/Restore:** Full instance backups are now automatically made daily (01:15) ([#660](https://github.com/oznu/homebridge-config-ui-x/issues/660))
  * Backup archives will be kept for 7 days before being removed
  * Backup archives will stored in your Homebridge config folder (`./backups/instance-backups`)
  * Users can customise the directory that backups are saved to by setting the [`scheduledBackupPath`](https://github.com/oznu/homebridge-config-ui-x/wiki/Config-Options#scheduledbackuppath) option - this allows you to have the automated backups archives saved to a network share or backup drive
  * Users can download these scheduled backups by opening the existing [Backup / Restore](https://github.com/homebridge/homebridge/wiki/Backup-and-Restore) tool
  * Added [REST API endpoints](https://github.com/oznu/homebridge-config-ui-x/wiki/API-Reference) for getting the list of automated backups, and downloading an existing backup archive
  * See the [Homebridge Backup and Restore](https://github.com/homebridge/homebridge/wiki/Backup-and-Restore) wiki article for further information about instance backups
* **hb-service:** Added full support for Enterprise / Red Hat / CentOS / Fedora Linux distributions - [wiki guide here](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Red-Hat%2C-CentOS-or-Fedora-Linux)

### Other Changes

* **Config Editor:** When loading a previous version of the config.json, a diff will be shown to highlight the changes from the current config and the one that will be restored ([#910](https://github.com/oznu/homebridge-config-ui-x/issues/910))
* **Config Editor:** Previous versions of the config.json file more than 60 days old will be periodically be deleted to remove the need for manual maintenance ([#732](https://github.com/oznu/homebridge-config-ui-x/issues/732))
* **User Accounts:** You can now change the login username of existing user accounts
* **i18n:** Improvements to French language translations ([#916](https://github.com/oznu/homebridge-config-ui-x/pull/916))
* **i18n:** Improvements to Spanish language translations ([#917](https://github.com/oznu/homebridge-config-ui-x/pull/917))
* **i18n:** Improvements to Polish language translations ([#918](https://github.com/oznu/homebridge-config-ui-x/pull/918))

## 4.30.0 (2020-10-21)

### Notable Changes

* **i18n:** Catalan (ca) language added by [@bwp91](https://github.com/bwp91) ([#892](https://github.com/oznu/homebridge-config-ui-x/pull/892))
  * The Homebridge UI is now available in 22 different languages!
* **Themes:** Added 11 more dark mode theme options with various colour accents ([#883](https://github.com/oznu/homebridge-config-ui-x/pull/883))

### Bug Fixes

* **System:** Initial support for Node.js v15 and npm v7, however please stay on the current LTS version of Node.js (currently v12.19.0) ([#904](https://github.com/oznu/homebridge-config-ui-x/issues/904))
* **Config Editor:** Fixed a bug that prevented the purging of config.json backups ([#898](https://github.com/oznu/homebridge-config-ui-x/issues/898))
* **Ring Plugin:** Fixed an issue that prevented two factor authentication codes with leading zeros from being accepted when linking a Ring Account ([#dgreif/ring#471](https://github.com/dgreif/ring/issues/471))

### Other Changes

* **Config Editor:** Updated the config editor hover help text to let users know it's possible to define an interface or an IP for the mdns interface ([#899](https://github.com/oznu/homebridge-config-ui-x/pull/899))
* **i18n:** Improvements to Slovenian language translations ([#889](https://github.com/oznu/homebridge-config-ui-x/pull/889))
* **i18n:** Improvements to Simplified Chinese language translations ([#890](https://github.com/oznu/homebridge-config-ui-x/pull/890))
* **i18n:** Improvements to Spanish language translations ([#891](https://github.com/oznu/homebridge-config-ui-x/pull/891),[#900](https://github.com/oznu/homebridge-config-ui-x/pull/900))
* **i18n:** Improvements to French language translations ([#893](https://github.com/oznu/homebridge-config-ui-x/pull/893))
* **i18n:** Improvements to Italian language translations ([#894](https://github.com/oznu/homebridge-config-ui-x/pull/894))
* **i18n:** Improvements to German language translations ([#895](https://github.com/oznu/homebridge-config-ui-x/pull/895))
* **i18n:** Improvements to Japanese language translations ([#897](https://github.com/oznu/homebridge-config-ui-x/pull/897))

## 4.29.0 (2020-10-13)

### Notable Changes

* **Plugins:** Added the ability to rollback to a previous version of a plugin, or install the beta/test version of a plugin
* **Homebridge:** Added the ability to rollback to a previous version of Homebridge, or install the latest beta version of Homebridge ([#877](https://github.com/oznu/homebridge-config-ui-x/issues/877))
  * Click the Homebridge version on the status dashboard to access this feature
* **Config Editor:** Automatic backups of the `config.json` file are now saved to `./backups/config-backups/` to reduce clutter in the Homebridge storage folder ([#732](https://github.com/oznu/homebridge-config-ui-x/pull/732))
  * Existing config backup files will be moved on next restart
* **Restart:** Made it more obvious which button to click when you need to restart Homebridge
* **Restart:** The restart page now shows separate statues for the UI and Homebridge
* **Restart:** Users running with [`hb-service`](https://github.com/oznu/homebridge-config-ui-x/wiki/Homebridge-Service-Command) will now be prompted to view the Homebridge logs if the Homebridge service is taking a long time to come back online after a restart
* **i18n:** Brazillian Portuguese (pt-BR) language added by [@zearthur99](https://github.com/zearthur99) ([#880](https://github.com/oznu/homebridge-config-ui-x/pull/880))
  * The Homebridge UI is now available in 21 different languages!

### Other Changes

* **Plugins:** Minor cosmetic improvements to the plugins settings GUI
* **i18n:** Improvements to French language translations ([#881](https://github.com/oznu/homebridge-config-ui-x/pull/881),[#882](https://github.com/oznu/homebridge-config-ui-x/pull/882))
* **i18n:** Improvements to Polish language translations ([#884](https://github.com/oznu/homebridge-config-ui-x/pull/884),[#886](https://github.com/oznu/homebridge-config-ui-x/pull/886))

## 4.28.1 (2020-10-08)

### Notable Changes

* **Plugins:** The plugin-specific JSON config editor will now automatically correct invalid JSON in more scenarios

### Other Changes

* **Auth:** Some changes to the "No Authentication Required" mode ([#865](https://github.com/oznu/homebridge-config-ui-x/issues/865))
* **i18n:** Improvements to German language translations ([#845](https://github.com/oznu/homebridge-config-ui-x/pull/845))
* **i18n:** Improvements to Spanish language translations ([#867](https://github.com/oznu/homebridge-config-ui-x/pull/867))
* **i18n:** Improvements to Traditional Chinese language translations ([#868](https://github.com/oznu/homebridge-config-ui-x/pull/868))
* **i18n:** Improvements to Polish language translations ([#874](https://github.com/oznu/homebridge-config-ui-x/pull/874))
* **i18n:** Improvements to Italian language translations ([#876](https://github.com/oznu/homebridge-config-ui-x/pull/876))
* **i18n:** Improvements to Simplified Chinese language translations ([#878](https://github.com/oznu/homebridge-config-ui-x/pull/878))

## 4.28.0 (2020-10-01)

### Notable Changes

* **Plugins:** The *Settings* action button will now appear on all plugins, even if they don't implement the [Plugin Settings GUI](https://developers.homebridge.io/#/config-schema)
  * For most plugins that don't implement the [Plugin Settings GUI](https://developers.homebridge.io/#/config-schema), the user will now be shown a config editor where they can manage the config just for that plugin
* **Plugins:** Dramatically increased the number of plugins which the Homebridge UI can offer to automatically remove the config for when uninstalling the plugin

### Other Changes

* **API**: Added REST API endpoints to lookup the plugin type and plugin alias that are needed to configure the plugin, see the [Swagger API documentation](https://github.com/oznu/homebridge-config-ui-x/wiki/API-Reference) for details

## 4.27.2 (2020-09-25)

### Notable Changes

* **Backup/Restore**: When restoring a backup, the original plugin version will be preserved

### Other Changes

* **i18n:** Improvements to Spanish language translations ([#837](https://github.com/oznu/homebridge-config-ui-x/pull/837))
* **i18n:** Improvements to German language translations ([#834](https://github.com/oznu/homebridge-config-ui-x/pull/834))
* **i18n:** Improvements to Swedish language translations ([#850](https://github.com/oznu/homebridge-config-ui-x/pull/850))
* **API**: Added REST API endpoints to lookup a single plugin from NPM, see the [Swagger API documentation](https://github.com/oznu/homebridge-config-ui-x/wiki/API-Reference) for details

### Bug Fixes 

* **hb-service:** The Homebridge version is now reflected in the HB Supervisor logs after an update ([#848](https://github.com/oznu/homebridge-config-ui-x/issues/848))
* **User Management:** Fixed a typo in the toast error message when loading users ([#859](https://github.com/oznu/homebridge-config-ui-x/pull/859))
* **Plugins:** Resolved an issue discovering the `npm` path on certain Windows installations ([#851](https://github.com/oznu/homebridge-config-ui-x/pull/851))

## 4.27.1 (2020-09-01)

### Other Changes

* **i18n:** Improvements to Dutch language translations ([#827](https://github.com/oznu/homebridge-config-ui-x/pull/827))
* **i18n:** Improvements to French language translations ([#828](https://github.com/oznu/homebridge-config-ui-x/pull/828))
* **i18n:** Improvements to English language translations ([#829](https://github.com/oznu/homebridge-config-ui-x/pull/829))

### Bug Fixes

* **Plugins:** Settings GUI: Fixed a bug that caused the cursor to go to the end of the text input field when editing
* **Plugins:** Fixed a bug that resulted in the verified plugins list being updated more frequently than it should have been

## 4.27.0 (2020-08-25)

### Other Changes

* **Plugins:** Partnered with [`homebridge-nest-cam`](https://github.com/Brandawg93/homebridge-nest-cam) to integrate the "issue token" retrieval process into the UI (may require plugin update)
* **API:** Added REST API endpoints to list and control Homebridge accessories, see the [Swagger API documentation](https://github.com/oznu/homebridge-config-ui-x/wiki/API-Reference) for details
* **i18n:** Improvements to Italian language translations ([#822](https://github.com/oznu/homebridge-config-ui-x/pull/822),[#825](https://github.com/oznu/homebridge-config-ui-x/pull/825))
* **i18n:** Improvements to Simplified Chinese language translations ([#823](https://github.com/oznu/homebridge-config-ui-x/pull/822))
* **i18n:** Improvements to Polish language translations ([#824](https://github.com/oznu/homebridge-config-ui-x/pull/824))

### Bug Fixes

* **Plugins:** Plugins are now properly sorted in Firefox ([#762](https://github.com/oznu/homebridge-config-ui-x/issues/762))

## 4.26.0 (2020-08-19)

### Bug Fixes 

* **Plugins:** Fix an issue rendering the title of an array in a plugin's config.schema.json ([#777](https://github.com/oznu/homebridge-config-ui-x/issues/777))

### Other Changes

* **hb-service:** Further improvements towards ensuring the UI is always accessible
* **Dashboard:** CPU temperature unit of measure can now optionally be set to differ from the system default ([#783](https://github.com/oznu/homebridge-config-ui-x/issues/783))
* Updated npm dependencies
* **Auth:** Improve two-factor authentication autocomplete ([#819](https://github.com/oznu/homebridge-config-ui-x/issues/819))

## 4.25.2 (2020-08-14)

### Bug Fixes

* Fix a bug that caused the UI not to load when it's debug mode was enabled ([#811](https://github.com/oznu/homebridge-config-ui-x/issues/811))

### Other Changes

* **i18n:** Improvements to Indonesian language translations ([#810](https://github.com/oznu/homebridge-config-ui-x/pull/810))

## 4.25.1 (2020-08-10)

### Node.js Version

* Dropped support for Node.js < 10.17.0
* Node.js versions 13.0.0 through 13.6.0 are not supported

### Notable Changes

* **Plugins:** Added the ability for developers of [verified](https://github.com/homebridge/homebridge/wiki/Verified-Plugins) plugins to [display ways users can support them](https://github.com/oznu/homebridge-config-ui-x/wiki/Developers:-Donation-Links) if they wish
* **hb-service:** Additional log management features for users running Homebridge with [`hb-service`](https://github.com/oznu/homebridge-config-ui-x/wiki/Homebridge-Service-Command) only:
  * Download the full Homebridge log file from the Log Viewer tab ([#795](https://github.com/oznu/homebridge-config-ui-x/issues/795))
  * Truncate/empty the Homebridge log file from the Log Viewer tab

### Other Changes

* **i18n:** Improvements to Italian language translations ([#716](https://github.com/oznu/homebridge-config-ui-x/pull/797),[#801](https://github.com/oznu/homebridge-config-ui-x/pull/801),[#803](https://github.com/oznu/homebridge-config-ui-x/pull/803))
* **API:** [Swagger API documentation](https://github.com/oznu/homebridge-config-ui-x/wiki/API-Reference) is now complete ([#776](https://github.com/oznu/homebridge-config-ui-x/issues/776))
* Updated npm dependencies

## 4.24.0 (2020-07-22)

### Notable Changes

* **i18n:** Bahasa Indonesia translation added by [@dwaan](https://github.com/dwaan) ([#760](https://github.com/oznu/homebridge-config-ui-x/pull/760))

### Bug Fixes

* **Accessory Control:** Fixed an issue with HeaterCooler control ([#772](https://github.com/oznu/homebridge-config-ui-x/issues/772))

## 4.23.2 (2020-06-29)

### Bug Fixes

* **Log Viewer:** Fixed an issue that prevented scrolling back in Safari ([#755](https://github.com/oznu/homebridge-config-ui-x/issues/755))
* **Dashboard:** Layout is locked by default on iPad Pro ([#756](https://github.com/oznu/homebridge-config-ui-x/issues/756))

## 4.23.1 (2020-06-26)

### Notable Changes

* **Auth:** Two Factor Authentication codes are now only valid for a single login only
* **Auth:** Two Factor Authentication codes are now valid for a window of +1

### Other Changes

* **System:** The [`hb-service update-node`](https://github.com/oznu/homebridge-config-ui-x/wiki/Homebridge-Service-Command#update-nodejs) command now explains why it cannot run on *Alpine Linux*, rather than showing a generic message that the platform is not supported ([#745](https://github.com/oznu/homebridge-config-ui-x/issues/745))
* Updated npm dependencies

## 4.23.0 (2020-06-18)

### Bug Fixes

* **Accessory Control:** Fahrenheit temperature display units are now rounded to one decimal place ([#741](https://github.com/oznu/homebridge-config-ui-x/issues/741))

### Other Changes

* **System:** (BETA) Added a command to `hb-service` to allow users to easily update their systems Node.js version to the latest LTS version
  * The command will work out where you currently have Node.js installed, and how you installed it, so you don't end up with multiple versions of Node.js installed in different places
  * The command can be used by all Homebridge users, not just those running Homebridge under `hb-service`
  * Supports macOS (excluding brew / other non-standard installs) and most Linux distributions (binary or from [NodeSource repos](https://github.com/nodesource/distributions))
  * Will not change your system unless it knows how to update safely
  * Update to latest LTS: `sudo hb-service update-node`
  * Install specific version: `sudo hb-service update-node 10.17.0` 

## 4.22.0 (2020-06-09)

### Notable Changes

* **Accessory Control:** Added support for [Heater Cooler](https://developers.homebridge.io/#/service/HeaterCooler) accessory type
* **Accessory Control:** Current temperature is now displayed with one decimal point ([#376](https://github.com/oznu/homebridge-config-ui-x/issues/376))

### Other Changes

* **Plugins:** Improvements to the [homebridge-ring](https://www.npmjs.com/package/homebridge-ring) plugin authorisation UI ([#734](https://github.com/oznu/homebridge-config-ui-x/pull/734))
* Updated npm dependencies
* **hb-service:** Improvements to the log viewer and log rotation management ([#731](https://github.com/oznu/homebridge-config-ui-x/pull/731))
* **i18n:** Improvements to Portuguese language translations ([#716](https://github.com/oznu/homebridge-config-ui-x/pull/716))
* **i18n:** Improvements to Russian language translations ([#721](https://github.com/oznu/homebridge-config-ui-x/pull/721), [#724](https://github.com/oznu/homebridge-config-ui-x/pull/724))
* **i18n:** Improvements to German language translations ([#730](https://github.com/oznu/homebridge-config-ui-x/pull/730))
* **Login:** Login wallpaper now properly covers larger screens ([#723](https://github.com/oznu/homebridge-config-ui-x/pull/723))

## 4.21.0 (2020-05-27)

### Notable Changes

* **API:** Added Swagger API Documentation; you can access this via `/swagger` (this is the same API already in use by the web client)
* **Auth:** Added the ability to secure your Homebridge UI user account with **Two Factor Authentication**, drop-down menu -> *User Accounts* -> *Setup 2FA*
* **Login:** Custom wallpaper can now be added by added a `ui-wallpaper.jpg` file in your Homebridge storage directory (and leaving the `loginWallpaper` config option blank) ([#697](https://github.com/oznu/homebridge-config-ui-x/issues/690))
* **Login:** Custom wallpaper changes will now break the browser cache ([#700](https://github.com/oznu/homebridge-config-ui-x/issues/700))
* **i18n:** Portuguese language translation added by [@SamuelMagano](https://github.com/SamuelMagano) ([#698](https://github.com/oznu/homebridge-config-ui-x/pull/698), [#708](https://github.com/oznu/homebridge-config-ui-x/pull/708))

### Other Changes

* **i18n:** Improvements to Polish language translation ([#695](https://github.com/oznu/homebridge-config-ui-x/pull/695), [#705](https://github.com/oznu/homebridge-config-ui-x/pull/705), [#707](https://github.com/oznu/homebridge-config-ui-x/pull/707))
* **i18n:** Improvements to Simplified Chinese language translations ([#696](https://github.com/oznu/homebridge-config-ui-x/pull/696))
* **i18n:** Improvements to French language translations ([#699](https://github.com/oznu/homebridge-config-ui-x/pull/699), [#711](https://github.com/oznu/homebridge-config-ui-x/pull/711))
* **i18n:** Improvements to German language translations ([#704](https://github.com/oznu/homebridge-config-ui-x/pull/704))
* **i18n:** Improvements to Traditional Chinese language translations ([#713](https://github.com/oznu/homebridge-config-ui-x/pull/713))

### Bug Fixes

* **Plugins:** Fixed a bug that caused the UI to fail to check if a plugin's `package.json` file exists correctly before attempting to open it

## 4.20.0 (2020-05-21)

### Notable Changes

* **Server:** Added the ability to unpair selected bridges / cameras / TVs without needed to reset the main Homebridge instance, this feature is available from the drop down menu -> *Homebridge Settings* 
* **hb-service:** Users can now remove individual accessories from the accessory cache, drop-down menu -> *Homebridge Settings* -> *Remove Single Cached Accessory* ([#202](https://github.com/oznu/homebridge-config-ui-x/issues/202))
* **i18n:** Slovenian language translation added by [@mitchoklemen](https://github.com/mitchoklemen) ([#694](https://github.com/oznu/homebridge-config-ui-x/pull/694))

### Other Changes

* **i18n:** Improvements to English language translation ([#689](https://github.com/oznu/homebridge-config-ui-x/pull/689))
* **i18n:** Improvements to Czech language translation ([#691](https://github.com/oznu/homebridge-config-ui-x/pull/691))
* **i18n:** Improvements to Polish language translation ([#693](https://github.com/oznu/homebridge-config-ui-x/pull/693))

### Bug Fixes

* **hb-service:** Fix a bug that caused strange behaviour on boot for users running macOS with home folders mounted on a remote network share ([#680](https://github.com/oznu/homebridge-config-ui-x/issues/680))
* **Accessory Control:** Fixed an issue where the accessory name would sometimes not be displayed correctly ([#690](https://github.com/oznu/homebridge-config-ui-x/issues/690))

## 4.19.0 (2020-05-14)

### Notable Changes

* **Plugins:** Plugin "update available" status is now cached for 5 minutes to reduce the number of outbound calls to the npm registry and decrease load times for the plugins tab for those with slower internet connections
* **Plugins:** If the initial attempt to load the "Verified Plugins" list fails, the UI will now try again after 60 seconds
* **Plugins:** Added the ability for developers to customise the "Add Item" button label in the settings ui ([#668](https://github.com/oznu/homebridge-config-ui-x/issues/668))
* **Plugins:** Added a "clear query" button to the right of the search box ([#674](https://github.com/oznu/homebridge-config-ui-x/issues/674))
* **Plugins:** Users of `homebridge-hue` can now download the debug dump file from the UI ([#676](https://github.com/oznu/homebridge-config-ui-x/issues/676))
* **Backup/Restore:** Added the ability to restore a `.hbfx` backup file

### Other Changes

* **i18n:** Improvements to Simplified Chinese language translations ([#672](https://github.com/oznu/homebridge-config-ui-x/pull/672),[#684](https://github.com/oznu/homebridge-config-ui-x/pull/684))
* **i18n:** Improvements to Italian language translations ([#678](https://github.com/oznu/homebridge-config-ui-x/pull/678))

## 4.18.0 (2020-05-07)

### Other Changes

* **Plugins:** Developers can now interpolate the current hostname into their header and footer markdown ([#661](https://github.com/oznu/homebridge-config-ui-x/pull/661))
* **Plugins:** Fixed an issue with select boxes in the plugin settings GUI ([#665](https://github.com/oznu/homebridge-config-ui-x/pull/665))
* **i18n:** Improvements to Polish language translations ([#656](https://github.com/oznu/homebridge-config-ui-x/pull/656))
* **i18n:** Improvements to Traditional Chinese language translations ([#659](https://github.com/oznu/homebridge-config-ui-x/pull/659))
* **i18n:** Improvements to German language translations ([#662](https://github.com/oznu/homebridge-config-ui-x/pull/662))
* Updated npm dependencies

### Bug Fixes

* **Plugins:** Fixed a bug that prevented the plugins from loading when there was an bad file in the global node_modules directory ([#657](https://github.com/oznu/homebridge-config-ui-x/issues/657))

## 4.17.1 (2020-04-29)

### Notable Changes

* **hb-service:** Add support for configuring the new *Keep Orphans* flag, `-K` ([#642](https://github.com/oznu/homebridge-config-ui-x/pull/642))

### Other Changes

* **i18n:** Improvements to Traditional Chinese language translations ([#630](https://github.com/oznu/homebridge-config-ui-x/pull/630))
* **i18n:** Improvements to Spanish language translations ([#635](https://github.com/oznu/homebridge-config-ui-x/pull/635))
* **Docker:** Fixed an issue that prevented plugins from being installed/updated when using the Debian/Ubuntu versions of the [oznu/homebridge](https://github.com/oznu/docker-homebridge) Docker image

### Bug Fixes

* **Homebridge Updates:** If Homebridge fails to update the error logs will now be displayed on the screen
* **Accessory Control:** The accessory layout will now be unlocked when adding a new room ([#643](https://github.com/oznu/homebridge-config-ui-x/issues/643))

## 4.16.0 (2020-04-21)

### Notable Changes

* **Accessory Control:** Added support for Valves and Irrigation Systems ([#47](https://github.com/oznu/homebridge-config-ui-x/issues/47#issuecomment-614660136))
* **Accessory Control:** Added support for Fan V2 ([#47](https://github.com/oznu/homebridge-config-ui-x/issues/47))
* **Accessory Control:** Added support for Air Purifiers ([#47](https://github.com/oznu/homebridge-config-ui-x/issues/47))
* **Accessory Control:** [@NicoFR75](https://github.com/NicoFR75) added support for Light Sensors ([#623](https://github.com/oznu/homebridge-config-ui-x/pull/623))

### Other Changes

* **i18n:** Improvements to German language translations ([#613](https://github.com/oznu/homebridge-config-ui-x/pull/613), [#614](https://github.com/oznu/homebridge-config-ui-x/pull/614))
* **i18n:** Improvements to Polish language translations ([#615](https://github.com/oznu/homebridge-config-ui-x/pull/615), [#620](https://github.com/oznu/homebridge-config-ui-x/pull/620))
* **i18n:** Improvements to Russian language translations ([#617](https://github.com/oznu/homebridge-config-ui-x/pull/617))
* Updated npm dependencies

### Bug Fixes

* **Accessory Control:** Added support for HAP short-form UUIDs ([#624](https://github.com/oznu/homebridge-config-ui-x/pull/624))

## 4.15.0 (2020-04-14)

### Notable Changes

* **Plugins:** A warning message will now be show when updating a plugin that requires a newer version of Node.js than the user currently has installed
* **Homebridge:** The next release of Homebridge will require Node.js v10.17.0 or later, the UI will prevent Homebridge from updating if the user's Node.js version is lower than this

### Other Changes

* **Accessory Control:** Accessories from other Homebridge instances will no longer be displayed unless the other instance has the same PIN set
* **i18n:** Improvements to Polish language translations ([#608](https://github.com/oznu/homebridge-config-ui-x/pull/608))
* **i18n:** Improvements to Russian language translations ([#609](https://github.com/oznu/homebridge-config-ui-x/pull/609))
* Updated npm dependencies

## 4.14.0 (2020-04-08)

### Notable Changes

* **Config Editor:** The config editor will now automatically correct some common JSON syntax errors on save such as removing trailing commas at the end of arrays and objects, removing comments, ensuring keys are quoted, and ensuring strings are quoted with double quotes instead of single quotes

### Other Changes

* **Linux:** Users are now prompted for confirmation before shutting down or restarting the host server
* **hb-service:** Linux only: systemd will now really ensure the network is online before starting Homebridge ([#605](https://github.com/oznu/homebridge-config-ui-x/pull/605))
* **i18n:** Improvements to German language translations ([#599](https://github.com/oznu/homebridge-config-ui-x/pull/599))
* Updated npm dependencies

### Bug Fixes

* **Plugins:** Fixed a bug that caused the plugin page not to load if the DNS lookup took a long time to timeout ([#598](https://github.com/oznu/homebridge-config-ui-x/issues/598))

## 4.13.3 (2020-03-31)

### Other Changes

* **Plugins:** The service will not longer attempt to check if updates are available for plugins that have `"private": true` set in their `package.json` file
* Updated npm dependencies

### Bug Fixes

* **hb-service:** Fixed a bug in the macOS installer that resulted in the wrong storage path being set in some circumstances ([homebridge#2464](https://github.com/homebridge/homebridge/issues/2464))

## 4.13.2 (2020-03-25)

### Other Changes

* Updated npm dependencies

### Bug Fixes

* **System:** When updating Homebridge, the release notes will now be shown prior to the update occuring
* **hb-service:** improved discovery of Homebridge install path

## 4.13.0 (2020-03-18)

### Notable Changes

* **Plugins:** Added support for scoped npm modules as Homebridge plugins, this means you can install plugins from npm such as `@username/homebridge-plugin`. Requires Homebridge update ([homebridge#2447](https://github.com/homebridge/homebridge/pull/2447))

### Other Changes

* **i18n:** The display of dates (in the Clock widget for example) are now localised ([#528](https://github.com/oznu/homebridge-config-ui-x/issues/528))
* **Accessory Control:** If controlling an accessory fails, the error message is now shown in the UI as a toast notification
* **hb-service:** Linux only: Updated the generated systemd unit file, `homebridge.service`, to allow the UI to listen on ports below 1024 (requires service re-install for existing [`hb-service`](https://github.com/oznu/homebridge-config-ui-x/wiki/Homebridge-Service-Command) users) ([#584](https://github.com/oznu/homebridge-config-ui-x/pull/584))
* **i18n:** Improvements to Traditional Chinese language translations ([#585](https://github.com/oznu/homebridge-config-ui-x/pull/585))
* **i18n:** Improvements to Dutch language translations ([#588](https://github.com/oznu/homebridge-config-ui-x/pull/588))
* Updated the loading spinner to match the set theme
* Updated npm dependencies
* Update UI to use Angular 9

### Bug Fixes

* **Accessory Control:** Address an issue that may have caused the UI to crash when Homebridge becomes unavailable ([#543](https://github.com/oznu/homebridge-config-ui-x/issues/543), [#583](https://github.com/oznu/homebridge-config-ui-x/issues/583))

## 4.12.0 (2020-03-05)

### Notable Changes

* **hb-service:** Added the ability to toggle Homebridge insecure mode (`-I`) from the UI when running under [`hb-service`](https://github.com/oznu/homebridge-config-ui-x/wiki/Homebridge-Service-Command)
* **Accessory Control:** Added support for Security System accessory types ([#47](https://github.com/oznu/homebridge-config-ui-x/issues/47#issuecomment-594452362))
* **Accessory Control:** Added support for Leak Sensor accessory types ([#47](https://github.com/oznu/homebridge-config-ui-x/issues/47#issuecomment-595138847))
* **Dashboard:** Added a configurable option to each widget to determine if it should be shown in the mobile/compact view ([#560](https://github.com/oznu/homebridge-config-ui-x/issues/560))
* **Dashboard:** [@Staubgeborener](https://github.com/Staubgeborener) added an option to the Homebridge status widget to let users decide if the Homebridge port should be shown or not ([#572](https://github.com/oznu/homebridge-config-ui-x/pull/572))

### Other Changes

* **Accessory Control:** Updated the icons for Motion, Occupancy and Contact sensors ([#47](https://github.com/oznu/homebridge-config-ui-x/issues/47#issuecomment-595138847))
* **Docker:** Added various changes to facilitate the [oznu/homebridge](https://github.com/oznu/docker-homebridge) Docker image using [`hb-service`](https://github.com/oznu/homebridge-config-ui-x/wiki/Homebridge-Service-Command) (docker image update required)
* **Backup/Restore:** If an error is encountered during a backup request (for example, a permission error), the error will now be logged to assist users in resolving the issue
* **Dashboard:** Allow the use of the previously removed `temp` option to read the CPU temperature from a file ([#470](https://github.com/oznu/homebridge-config-ui-x/issues/470))
* **i18n:** Added the ability to manually set the UI language ([#398](https://github.com/oznu/homebridge-config-ui-x/issues/398))
* **i18n:** Improvements to Polish language translations ([#568](https://github.com/oznu/homebridge-config-ui-x/pull/568), [#575](https://github.com/oznu/homebridge-config-ui-x/pull/575), [#576](https://github.com/oznu/homebridge-config-ui-x/pull/576))
* **i18n:** Improvements to German language translations ([#571](https://github.com/oznu/homebridge-config-ui-x/pull/571), [#578](https://github.com/oznu/homebridge-config-ui-x/pull/578))
* **i18n:** Improvements to Russian language translations ([#573](https://github.com/oznu/homebridge-config-ui-x/pull/573), [#577](https://github.com/oznu/homebridge-config-ui-x/pull/577))
* Updated npm dependencies

## 4.11.0 (2020-02-27)

### Backup / Restore Feature

This release comes with a new feature that allows users to backup and restore their entire Homebridge instance.

The backup and restore process works in such a way that users should be able to use the feature roll back to a previous state, or transfer their current Homebridge setup to a new server without the need to re-pair with HomeKit.

Highlights:

* Full backup of your Homebridge storage, persist and accessories folders
* Migrate your Homebridge instance to a new platform or server with ease
* Rollback your existing instance in seconds (if you made a full backup first)
* The backup is a standard .tar.gz archive (this means manual restores or extracting a single file is possible)
* Works on all platforms that are supported by Homebridge Config UI X including Docker, macOS, Windows 10, Linux and Raspbian
* The restore process will install any missing plugins (provided they are published to npm)

### Notable Changes

* **hb-service:** When running under Homebridge using the [`hb-service`](https://github.com/oznu/homebridge-config-ui-x/wiki/Homebridge-Service-Command) process supervisor, the following changes have been made to the *Restart* action from the UI:
  * If no changes have been made to the Homebridge Config UI X, or the `bridge` sections in the `config.json`, just the Homebridge process will be restarted
  * If changes have been made to either of those sections, both the UI and the Homebridge processes will be restarted as per normal
  * This change will significantly decrease the Homebridge restart time on lower powered devices
  * No changes have been made to the `hb-service restart` command executed via the Terminal

### Other Changes 

* **i18n:** Improvements to Russian language translations ([#554](https://github.com/oznu/homebridge-config-ui-x/pull/554), [#564](https://github.com/oznu/homebridge-config-ui-x/pull/564))
* **i18n:** Improvements to German language translations ([#555](https://github.com/oznu/homebridge-config-ui-x/pull/555), [#559](https://github.com/oznu/homebridge-config-ui-x/pull/559), [#563](https://github.com/oznu/homebridge-config-ui-x/pull/563), [#565](https://github.com/oznu/homebridge-config-ui-x/pull/565), [#567](https://github.com/oznu/homebridge-config-ui-x/pull/567))
* **i18n:** Improvements to Swedish language translations ([#561](https://github.com/oznu/homebridge-config-ui-x/pull/561))
* **i18n:** Improvements to Polish language translations ([#562](https://github.com/oznu/homebridge-config-ui-x/pull/562))

## 4.10.3 (2020-02-20)

### Other Changes 

* **Config Editor:** Ensure the bridge port number is a valid number and automatically correct it on save if not ([#553](https://github.com/oznu/homebridge-config-ui-x/issues/553))
* **i18n:** Improvements to Polish language translations ([#551](https://github.com/oznu/homebridge-config-ui-x/pull/551))
* **i18n:** Improvements to Russian language translations ([#552](https://github.com/oznu/homebridge-config-ui-x/pull/552))

### Bug Fixes

* **Dashboard:** Fixed a bug that caused Homebridge to display as "Not Running" when the bridge port number was quoted as a string in the `config.json` ([#553](https://github.com/oznu/homebridge-config-ui-x/issues/553))

## 4.10.2 (2020-02-19)

### Other Changes 

* **Dashboard:** Added more date formats to the Clock widget ([#463](https://github.com/oznu/homebridge-config-ui-x/issues/463))
* **Dashboard:** Adjusted method used to check if the Homebridge process is running
* **Config Editor:** Enabled code folding
* **Accessory Control:** Added a message to the "Add Room" modal explaining that the rooms created will not appear in HomeKit
* Updated npm dependencies

### Bug Fixes

* **UI:** Fixed the dropdown menu display on very small screens ([#540](https://github.com/oznu/homebridge-config-ui-x/issues/540))
* **Docker:** Fixed a bug that prevented the UI from restarting correctly when running the Debian Docker image

## 4.10.1 (2020-02-12)

### Other Changes 

* **System:** The UI no longer requires a restart to apply changes to certain settings (such as theme, temperature units, sudo etc.)
* **Plugins:** Fixed a bug that caused duplicate help text in some circumstances ([#535](https://github.com/oznu/homebridge-config-ui-x/issues/535))
* **i18n:** Improvements to Polish language translations ([#527](https://github.com/oznu/homebridge-config-ui-x/pull/527))
* **i18n:** Improvements to German language translations ([#529](https://github.com/oznu/homebridge-config-ui-x/pull/529))
* **i18n:** Improvements to Russian language translations ([#531](https://github.com/oznu/homebridge-config-ui-x/pull/531))

## 4.10.0 (2020-02-05)

### Notable Changes

* **Plugins:** Added a confirmation box when uninstalling plugins
* **Plugins:** Added an option to have a plugin's config removed from the `config.json` when the plugin is being uninstalled (only plugins that implement the [Plugins Settings GUI](https://github.com/oznu/homebridge-config-ui-x/wiki/Developers:-Plugin-Settings-GUI) support this feature)
* **System:** The UI will now attempt to rebuild it's own modules after a Node.js upgrade
* **System:** Added the ability for [`hb-service`](https://github.com/oznu/homebridge-config-ui-x/wiki/Homebridge-Service-Command) users to clear the Homebridge cached accessories from the UI (without doing a full Homebridge reset)
* **Dashboard:** Weather widget now supports local translations of the current weather description ([#515](https://github.com/oznu/homebridge-config-ui-x/issues/515))

### Other Changes 

* **i18n:** Improvements to Polish language translations ([#519](https://github.com/oznu/homebridge-config-ui-x/pull/519))
* **hb-service:** Adjusted the [`hb-service rebuild`](https://github.com/oznu/homebridge-config-ui-x/wiki/Homebridge-Service-Command) command to just rebuild the modules used by Homebridge Config UI X. This command should now work to fix the modules used by Homebridge Config UI X on any setup - not just those using `hb-service` as a process supervisor
* **Accessory Control:** Minor tweaks to the Speaker accessory type
* Updated npm dependencies

## 4.9.0 (2020-01-29)

### Notable Changes

* **Accessory Control:** [@LaborEtArs](https://github.com/LaborEtArs) added support for Speaker and Battery Service accessory types ([#500](https://github.com/oznu/homebridge-config-ui-x/pull/500))

### Other Changes

* **i18n:** Improvements to Russian language translations ([#502](https://github.com/oznu/homebridge-config-ui-x/pull/502))
* **i18n:** Improvements to German language translations ([#512](https://github.com/oznu/homebridge-config-ui-x/pull/512))
* **Plugins:** Prevent the dynamic `users` config for the [homebridge-hue](https://github.com/ebaauw/homebridge-hue) plugin from being deleted when using the Plugin Config GUI ([#417](https://github.com/oznu/homebridge-config-ui-x/issues/417))
* **Accessory Control:** `CameraRTPStreamManagement` accessory types will no longer be displayed
* Updated npm dependencies

## 4.8.1 (2020-01-22)

### Notable Changes

* **hb-service:** Added an option to the [`hb-service`](https://github.com/oznu/homebridge-config-ui-x/wiki/Homebridge-Service-Command) to help users rebuild their Node.js modules after a major Node.js version update

### Bug Fixes

* **System:** Fixed an issue causing the UI to crash when running in a FreeBSD Jailed Shell ([#488](https://github.com/oznu/homebridge-config-ui-x/issues/488))
* **System:** Fixed an issue that may have caused Homebridge not to restart when a certain plugin was installed when running on Docker ([#494](https://github.com/oznu/homebridge-config-ui-x/issues/494))

## 4.8.0 (2020-01-18)

### Notable Changes

* **System:** Prevent in-app updates to the UI for Windows 10 users. Windows file-locking prevents online updates from completing successfully while Homebridge Config UI X is still running, this can leave Homebridge in an unstable state. After this update Windows users will need to manually stop the Homebridge service, then manually update the UI using npm. **Existing Windows 10 users:** please perform this update manually after stopping the Homebridge service!
* **Dashboard:** Added a Clock widget, users can select the time format they wish the clock to display ([#459](https://github.com/oznu/homebridge-config-ui-x/issues/459))
* **hb-service:** Added the ability for [`hb-service`](https://github.com/oznu/homebridge-config-ui-x/wiki/Homebridge-Service-Command) users to set the Homebridge `-D` and `-R` flags, as well as the `DEBUG` and `NODE_OPTIONS` environment variables directly from the UI ([#472](https://github.com/oznu/homebridge-config-ui-x/issues/472))

https://user-images.githubusercontent.com/3979615/72317538-b92b6780-36ed-11ea-8001-77921be18417.png

### Other Changes

* **i18n:** Improvements to Polish language translations ([#467](https://github.com/oznu/homebridge-config-ui-x/pull/467))
* **i18n:** Improvements to Swedish language translations ([#476](https://github.com/oznu/homebridge-config-ui-x/pull/476))
* **i18n:** Improvements to German language translations ([#482](https://github.com/oznu/homebridge-config-ui-x/pull/482))
* **Dashboard:** Node.js / npm version warning icons will now only show up if you are using an unsupported version of Node.js, the latest available version can still be viewed by hovering over the current version
* **Plugins**: Added seemless account linking support for the [Homebridge Honeywell Home](https://github.com/donavanbecker/homebridge-honeywell-home#readme) plugin
* **Plugins**: Added the ability for [Homebridge Ring](https://github.com/dgreif/ring/tree/master/homebridge) users to get their Ring account `refreshToken` directly from the UI ([#486](https://github.com/oznu/homebridge-config-ui-x/pull/486))

### Bug Fixes

* **System:** Fixed an issue causing the UI to crash when running in a FreeBSD Jailed Shell ([#461](https://github.com/oznu/homebridge-config-ui-x/issues/461))
* **System:** Prevent an unnecessary log message showing up in the logs on certain Linux distros ([#466](https://github.com/oznu/homebridge-config-ui-x/issues/466))
* **System:** Fixed a bug that caused the UI to crash when running in debug mode in production ([#469](https://github.com/oznu/homebridge-config-ui-x/issues/469))
* **Dashboard:** Fixed a bug where the "Plugin Status" icon was not changing when there were updates available ([#443](https://github.com/oznu/homebridge-config-ui-x/issues/443))
* **Auth:** Fixed a warning about a depreciated option that was in use ([#473](https://github.com/oznu/homebridge-config-ui-x/issues/473))
* **Config Editor:** Fixed a issue that prevented the on-screen keyboard from being able to be displayed after it was dismissed on an iPad Pro ([#480](https://github.com/oznu/homebridge-config-ui-x/issues/480))

## 4.7.0 (2020-01-11)

### New Dashboard

This release comes with a brand new status dashboard that features a fully customisable, widget-based design. Users can decide which widgets they wish to enable and position and resize them as they like.

https://user-images.githubusercontent.com/3979615/71886653-b16d3f80-3190-11ea-9ff8-49dc4ae4fff0.png

New widgets include:

* **Homebridge Status Widget** - Homebridge version and update check, current Homebridge service status and Homebridge plugins update check
* **CPU Widget** - shows the current cpu load (now much more accurate) and CPU temperature when available, plus a graph of the last 0-10 minutes cpu load
* **Memory Widget** - shows the total and available memory (previously "Free" memory as show which is not a reliable indicator of "Available" memory), plus a graph of the last 0-10 minutes free memory
* **Uptime Widget** - shows the server uptime and the process uptime
* **QR Code Widget** - shows the pairing QR Code and Homebridge PIN
* **Homebridge Logs Widget** - shows the Homebridge logs stream
* **Homebridge Terminal Widget** - an interactive terminal (only available when interactive web terminals are enabled)
* **System Information Widget** - shows details about your server and homebridge setup
* **Weather Widget** - shows the current weather for the set location (may add a forecast later)
* **Accessories Widget** - display and control the accessories you select

### Simple Service Installer

This release expands the `hb-service` command to support macOS and Linux in addition to Windows 10. This command allows you to setup a Homebridge instance as a service in seconds.

Running `hb-service install` will setup Homebridge and Homebridge Config UI X to run as a service with auto-start on boot. The same command works across Linux, macOS and Windows 10.

https://user-images.githubusercontent.com/3979615/71888439-4291e580-3194-11ea-8687-a3d58f94ba47.gif

Notable Features:

* The UI will remain running even if there is an issue preventing Homebridge from starting
* Easily setup and manage multiple homebridge instances
* The ability to start, stop, restart and view the logs of your Homebridge instances using the `hb-service` commands
* [See the wiki for further details](https://github.com/oznu/homebridge-config-ui-x/wiki/Homebridge-Service-Command)

### New Config Editor

The config editor (non-mobile) has had the Ace Editor replaced with the [Microsoft Monaco Editor](https://microsoft.github.io/monaco-editor/) (the code editor that powers VS Code).

This allow for much more powerful JSON syntax checking, more helpful error messages and the new ability to detect duplicate keys in object (like when a second platforms[] array is added by mistake!).

https://user-images.githubusercontent.com/3979615/71890579-b635f180-3198-11ea-98ab-cc7b7263afd9.gif

In addition:

* Help text is now shown when hovering over the core components of the config.json
* Autocomplete of the bridge, plugins, ports and mdns objects
* Detect when accessory config has been added to the platform array, or vice versa
* Warnings when the JSON does not match what is allowed by Homebridge

### Other Changes

* **Logs:** URLs in the log output are now clickable
* **Status:** CPU utilization is now shown for Windows 10 users
* **Status:** CPU temperature option, `temp`, has been removed, the CPU temperature will now automatically be displayed where possible on Linux and Windows
* **System:** Removed the `websocketCompatibilityMode` option, this setting is now the default for all users
* **Terminal:** The terminal now automatically respawns the shell if the shell is terminated by the user (e.g, when using CTRL+D)
* **Accessory Control:** The right click handler on accessory tiles has been removed and replaced with a clickable cog icon in the top right hand side of each tile
* **Themes:** The legacy Dark Mode (v1) has been removed, users will be migrated to the new Dark Mode automatically
* **i18n:** Improvements to Simplified Chinese language translations ([#431](https://github.com/oznu/homebridge-config-ui-x/pull/431))
* **i18n:** Improvements to German language translations ([#444](https://github.com/oznu/homebridge-config-ui-x/pull/444))
* **i18n:** Improvements to Spanish language translations ([#445](https://github.com/oznu/homebridge-config-ui-x/pull/445))
* **i18n:** Improvements to Polish language translations ([#446](https://github.com/oznu/homebridge-config-ui-x/pull/446))
* Updated npm dependencies

### Bug Fixes

* **System:** Fixed a bug that prevented the Windows 10 service installer (`hb-service`) from working when the user's login name contained spaces
* **Linux:** Fixed a bug where the custom shutdown command was executing the custom restart command instead ([#442](https://github.com/oznu/homebridge-config-ui-x/issues/442))

## 4.6.7 (2019-12-24)

### Bug Fixes

* **System:** The Windows 10 service installer (`hb-service`) now configures the system firewall

## 4.6.6 (2019-12-17)

### Bug Fixes

* **Accessory Control:** Fixed a bug that causes some accessory states not to update ([#426](https://github.com/oznu/homebridge-config-ui-x/issues/426))

### Other Changes

* Updated npm dependencies

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