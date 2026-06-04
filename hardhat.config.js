import { defineConfig } from "hardhat/config";
import hardhatToolbox from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

export default defineConfig({
  plugins: [hardhatToolbox],
  solidity: {
    // paste your solidity version/settings from the old config here
    version: "0.8.28",
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    // UZHETH PoS chain — fill in the RPC URL and Chain ID from your course materials
    uzheth_pos: {
      type: "http",
      url: process.env.UZHETH_POS_RPC_URL || "https://rpc.uzheths.ifi.uzh.ch",
      chainId: parseInt(process.env.UZHETH_POS_CHAIN_ID || "702"),
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
  paths: {
    sources: "./contracts",
    artifacts: "./artifacts",
    cache: "./cache"
  }
});
