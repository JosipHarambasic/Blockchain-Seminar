// ─── Production environment ──────────────────────────────────────────────────
export const environment = {
  production: true,

  networkChainId: 702,
  networkName: "UZHETH PoS",
  rpcUrl: "https://rpc.uzheths.ifi.uzh.ch",

  // Update with the deployed contract address before building for production
  contractAddress: "0x0000000000000000000000000000000000000000",

  subgraphUrl: "https://api.thegraph.com/subgraphs/name/YOUR_GITHUB_USER/forum-subgraph",

  ipfsGateway: "https://dweb.link/ipfs/",
};
