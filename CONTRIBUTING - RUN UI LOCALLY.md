# Contributing - run UI locally

# Install apps
- Github desktop: [https://desktop.github.com](https://desktop.github.com)
- VSCode: [https://code.visualstudio.com](https://code.visualstudio.com)
- Node: [https://nodejs.org/en/download](https://nodejs.org/en/download)

# Install packages
If you don't have installed, run system Terminal and type to install:
- Homebridge: `sudo npm install -g homebridge`.
- Angular `npm install @angular-devkit/build-angular --force`.

# Run locally

- Go to GitHub page of repository you want to run. E.G.: [https://github.com/homebridge/homebridge-config-ui-x](https://github.com/homebridge/homebridge-config-ui-x)

- Click 'Code' / 'Open with GitHub Desktop'.

<img src="https://github.com/homebridge/homebridge-config-ui-x/assets/82271669/070a8bd0-b17d-468f-87ff-b34218c4adb9" width="400px">

- In GitHub Desktop select branch and click 'Open in Visual Studio Code'.

<img src="https://github.com/homebridge/homebridge-config-ui-x/assets/82271669/6063ca4b-a95c-4a57-bab6-315a22f4e9a2" width="600px">

- Right click on 'npm scripts' and run install. If you don't see 'npm scripts' - right click where it says 'outline' and enable the 'npm scripts'.

<img src="https://github.com/homebridge/homebridge-config-ui-x/assets/82271669/0ee39ee7-93ef-44b3-9a6f-30c28d8ee528" width="400px">

- From there you can run these scripts. The watch script is what will let you run UI locally.

<img src="https://github.com/homebridge/homebridge-config-ui-x/assets/82271669/35c113fa-4e11-4557-ad4e-383aa905a1d2" width="400px">

# Watch changes
- You should now be able to navigate to `https://localhost:4200` in your browser
- It will connect to your homebridge instance running on `https://localhost:8581`.
- The UI will automatically reload whenever you make changes to the code.



