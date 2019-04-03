const webpack = require('webpack');
const path = require('path');

module.exports = {
  entry: {
    server: './src/server.ts',
  },
  target: 'node',
  externals: {
    "fsevents": "fsevents",
    "node-pty-prebuilt-multiarch": "node-pty-prebuilt-multiarch",
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
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  optimization: {
    minimize: false,
  },
  output: {
    // filename: "server.js",
    path: path.join(__dirname, "dist"),
    libraryTarget: "commonjs",
  },
  mode: "production",
  node: {
    console: false,
    global: false,
    process: false,
    Buffer: false,
    __filename: false,
    __dirname: false,
    setImmediate: false
  },
  plugins: [],
};