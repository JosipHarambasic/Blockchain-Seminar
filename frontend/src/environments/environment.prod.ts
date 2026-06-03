// ─── Production environment ──────────────────────────────────────────────────
export const environment = {
  production: true,

  networkChainId: 70207,
  networkName: "UZHETH PoS",
  rpcUrl: "http://130.60.144.77:8554",

  // Update with the deployed contract address before building for production
  contractAddress: "0x0000000000000000000000000000000000000000",

  subgraphUrl: "https://api.thegraph.com/subgraphs/name/YOUR_GITHUB_USER/forum-subgraph",

  ipfsGateway: "https://dweb.link/ipfs/",
};
