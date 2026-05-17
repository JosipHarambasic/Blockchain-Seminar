/**
 * Custom Webpack configuration to polyfill Node.js globals required by ethers.js
 * in the browser environment.
 */
const webpack = require("webpack");

module.exports = {
  resolve: {
    fallback: {
      buffer: require.resolve("buffer/"),
      stream: false,
      crypto: false,
      http: false,
      https: false,
      os: false,
      url: false,
      assert: false,
    },
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ["buffer", "Buffer"],
      process: "process/browser",
    }),
  ],
};
