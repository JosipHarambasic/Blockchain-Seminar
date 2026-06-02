/**
 * Custom Webpack configuration to polyfill Node.js globals required by
 * ethers.js and Helia in the browser environment.
 */
const webpack = require("webpack");

module.exports = {
  resolve: {
    fallback: {
      buffer:     require.resolve("buffer/"),
      stream:     false,
      crypto:     false,
      http:       false,
      https:      false,
      os:         false,
      url:        false,
      assert:     false,
      path:       false,
      fs:         false,
      net:        false,
      tls:        false,
      zlib:       false,
      events:     false,
    },
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer:  ["buffer", "Buffer"],
      process: "process/browser",
    }),
  ],
  // Helia and its transitive deps ship as pure ESM; tell webpack to handle them.
  experiments: {
    asyncWebAssembly: true,
  },
};
