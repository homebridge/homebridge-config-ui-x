const data = '\u001b[37m[11/11/2023, 21:35:35] \u001b[39m\u001b[36m[Govee]\u001b[39m [Desk Lamp]\n\r';

const pluginName = 'Goveer';

const readLines = () => {
  const lines = data.split('\n');
  let includeNextLine = false;

  lines.forEach((line) => {
    if (includeNextLine) {
      if (line.match(/ \u001b\[39m\u001b\[36m\[.*?]\u001b\[39m /)) {
        includeNextLine = false;
      } else {
        console.log(line);
        return;
      }
    }

    if (line.includes(` \u001b[39m\u001b[36m[${pluginName}]\u001b[39m `)) {
      console.log(line);
      includeNextLine = true;
    }
  });
};

readLines();
