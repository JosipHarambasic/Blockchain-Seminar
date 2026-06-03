import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import "dotenv/config";
import { defineConfig } from "hardhat/config";

const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
const uzhethAccounts = deployerPrivateKey
  ? [deployerPrivateKey.startsWith("0x") ? deployerPrivateKey : `0x${deployerPrivateKey}`]
  : [];

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },
    // UZHETH PoS chain — fill in the RPC URL and Chain ID from your course materials
    uzheth_pos: {
      type: "http",
      chainType: "l1",
      url: process.env.UZHETH_POS_RPC_URL || "http://130.60.144.77:8554",
      chainId: Number.parseInt(process.env.UZHETH_POS_CHAIN_ID || "70207", 10),
      accounts: uzhethAccounts,
    },
  },
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY || "",
    },
  },
});
