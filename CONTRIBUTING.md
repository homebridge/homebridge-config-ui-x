# Contributing

Pull requests are welcome from everyone.

This project is written in [TypeScript](https://www.typescriptlang.org/) and uses [Nest.js](https://nestjs.com/) for the server and [Angular](https://angular.dev/) for the client UI.

## Getting Setup

> [!NOTE]
> The Raspberry Pi and similar boards do not meet the memory or CPU requirements required to set up the development environment.

First, remove any globally installed versions of `homebridge-config-ui-x` you may have installed on your development machine:

```sh
npm uninstall -g homebridge-config-ui-x
```

Fork, then clone the repo:

```sh
git clone git@github.com:your-username/homebridge-config-ui-x.git
```

Install npm dependencies for the plugin and the UI:

```sh
npm install && cd ui && npm install && cd ..
```

Build the plugin, it may take sometime to compile the UI:

```sh
npm run build
```

Symlink your development directory to global:

```sh
npm link
```

If you don't have Homebridge installed already run:

```sh
npm install -g homebridge
```

## Watching For Changes

This will start the Angular development server on port `4200` and a standalone server on port `8581`. It will also watch and compile changes made to the server side TypeScript code:

```sh
npm run watch
```

You should now be able to navigate to `http://localhost:4200` in your browser which will connect to your Homebridge instance running on port `8581`. The UI will automatically reload whenever you make changes to the code.

> [!IMPORTANT]
> **Safari HTTPS Redirect Issue**: Safari may redirect `http://localhost` to HTTPS due to cached HSTS (HTTP Strict Transport Security) headers. To fix this:
>
> 1. Open Safari → Settings → Privacy → Manage Website Data
> 2. Search for "localhost" and "127.0.0.1"
> 3. Remove these entries
> 4. Restart Safari and try again
>
> Alternatively, use **Chrome or Firefox** for development (recommended), or access the backend directly at `http://localhost:8581`.

> [!NOTE]
> **Connection Troubleshooting**: The dev server listens on all IPv4 interfaces (`0.0.0.0`). If you still can't connect:
>
> - Try `http://127.0.0.1:4200` explicitly
> - Make sure `npm run watch` is running without errors in both the UI and server
> - Check that ports 4200 and 8581 are not blocked by firewall
> - As a fallback, use the backend directly at `http://localhost:8581` (no hot reload)

## Running Tests

If you have made changes to the server side code, you should run the e2e test suite before creating a pull request:

```sh
npm run test
```

## Contributing To Translations

Additional language translations, or improvements to existing translations are most welcome. Translations can be found here:

https://github.com/homebridge/homebridge-config-ui-x/tree/latest/ui/src/i18n
