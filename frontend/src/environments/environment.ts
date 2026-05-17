// ─── Development environment ────────────────────────────────────────────────
// After deploying the contract run:
//   npx hardhat run scripts/deploy.js --network uzheth_pos
// and paste the printed address below.

export const environment = {
  production: false,

  // UZHETH PoS network configuration
  // Chain ID: obtain from your course materials (PoW = 702, PoS may differ)
  networkChainId: 702,
  networkName: "UZHETH PoS",
  rpcUrl: "https://rpc.uzheths.ifi.uzh.ch",

  // Deployed Forum contract address — update after running deploy.js
  contractAddress: "0x0000000000000000000000000000000000000000",
};
