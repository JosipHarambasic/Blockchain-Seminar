// ─── Development environment ────────────────────────────────────────────────
// After deploying the contract run:
//   npx hardhat run scripts/deploy.js --network uzheth_pos
// and paste the printed address into contractAddress below.

export const environment = {
  production: false,

  // UZHETH PoS network configuration
  networkChainId: 70207,
  networkName: "UZHETH PoS",
  rpcUrl: "http://130.60.144.77:8554",

  // Deployed Forum contract address — update after running deploy.js
  contractAddress: "0x554b17ADAc66fDbE30e34217Cd1A2C3D4095Fc8e",

  // IPFS gateway used for fallback reads (if the local Helia node doesn't have the block).
  ipfsGateway: "https://dweb.link/ipfs/",

  // Backend endpoint that pins post/comment DAG-JSON content to public IPFS.
  ipfsPinningEndpoint: "http://127.0.0.1:3000/api/ipfs/pin",
};
