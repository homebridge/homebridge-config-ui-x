# Contributing

Pull requests are welcome from everyone.

This project is written in [TypeScript](https://www.typescriptlang.org/) and uses [Express](https://expressjs.com/) for the server and [Angular](https://angular.io/) for the client UI.

## Getting Setup

First, remove any globally installed versions of `homebridge-config-ui-x` you may have installed on your development machine:

```
npm uninstall -g homebridge-config-ui-x
```

Fork, then clone the repo:

```
git clone git@github.com:your-username/homebridge-config-ui-x.git
```

Install npm dependencies for the plugin:

```
npm install
```

Install the npm dependencies for the UI:

```
npm run install:ui
```

Build the plugin, it may take sometime to compile the UI:

```
npm run build
```

Symlink your development directory to global:

```
npm link
```

You can now run `homebridge` and it will use `homebridge-config-ui-x` from your development directory. Make sure you have setup `homebridge-config-ui-x` in your `config.json` and that the plugin is configured to run on port `8080`. Here is a good template to use:

```json
"platforms": [
    {
        "platform": "config",
        "name": "Config",
        "port": 8080
    }
]
```

## Watching For Changes

This will start the Angular development server on port `4200`. It will also watch and compile changes made to the server side TypeScript code:

```
npm run watch
```

You should now be able to navigate to `https://localhost:4200` in your browser which will connect to your `homebridge` instance running on port `8080`. The UI will automatically reload whenever you make changes to the UI, however you will need to restart `homebridge` each time you make a change to the server side code.

## Contributing To Translations

Additional language translations, or improvments to existing translations are most welcome.  Translations can be found here: 

https://github.com/oznu/homebridge-config-ui-x/tree/master/ui/src/i18n

[BabelEdit](https://www.codeandweb.com/babeledit) is a useful tool that will help editing or creating a new language file. Where possible, please derive new translations from the English version.
