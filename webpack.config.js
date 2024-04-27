/* eslint-disable @typescript-eslint/no-var-requires */
import path from 'path';
import webpack from 'webpack';
import packageJson from './package.json' with { type: 'json' };
import { fileURLToPath } from 'url';

const externals = {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

for (const dep of Object.keys(packageJson.dependencies)) {

  externals[dep] = dep;
}

export default {

  entry: {

    server: './src/main.ts',
  },

  output: {

    filename: 'main.js',
    path: path.join(__dirname, 'dist'),
    libraryTarget: 'commonjs',
  },

  target: 'node',
  mode: 'production',
  externals: externals,
  node: {

    global: false,
    __filename: false,
    __dirname: false,
  },
  resolve: {

    extensions: ['.tsx', '.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  optimization: {
    minimize: false,
  },
  plugins: [
    new webpack.IgnorePlugin({ resourceRegExp: /^\.\/locale$/, contextRegExp: /@nestjs\/microservices/ }),
    new webpack.IgnorePlugin({ resourceRegExp: /^\.\/locale$/, contextRegExp: /@nestjs\/platform-express/ }),
    new webpack.IgnorePlugin({ resourceRegExp: /^\.\/locale$/, contextRegExp: /swagger-ui-express/ }),
    new webpack.IgnorePlugin({ resourceRegExp: /^\.\/locale$/, contextRegExp: /cache-manager/ }),
    new webpack.IgnorePlugin({ resourceRegExp: /^\.\/locale$/, contextRegExp: /osx-temperature-sensor/ }),
  ],
};
