# Decentralised Forum

A production-grade decentralised forum built on:

- **Smart Contract** – Solidity 0.8.28, deployed on UZHETH PoS (chainId 702)
- **IPFS** – Content stored via Helia (in-browser node, IndexedDB persistence)
- **The Graph** – Off-chain indexing for paginated feeds
- **Frontend** – Angular 20 + Ionic 8, ethers.js v6, standalone components, signals

---

## Architecture

```
User ──► Angular frontend (Ionic)
          │
          ├─ WalletService  ──► MetaMask / ethers.js v6
          ├─ IpfsService    ──► Helia in-browser IPFS node
          ├─ ForumService   ──► Forum.sol (via ethers.js)
          └─ SubgraphService──► The Graph GraphQL endpoint
                                     │
Forum.sol ◄──────────────────────────┘
  (UZHETH PoS, chainId 702)
  stores: bytes32 contentHash (SHA-256 of JSON via IPFS CIDv1)

Helia (in-browser, IndexedDB)
  stores: { title, body } JSON, returns CIDv1 / bytes32
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 |
| npm | ≥ 10 |
| MetaMask | latest |
| graph-cli | installed via `npm i -g @graphprotocol/graph-cli` |

---

## 1 — Smart Contract

### Install dependencies

```bash
npm install          # root — installs Hardhat etc.
```

### Configure environment

Copy `.env.example` to `.env` (create it if absent):

```
UZHETH_RPC=https://rpc.uzheths.ifi.uzh.ch
DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
```

### Compile & test

```bash
npx hardhat compile
npx hardhat test
```

### Deploy to UZHETH PoS

```bash
npx hardhat run scripts/deploy.js --network uzheth_pos
```

The script:
1. Deploys `Forum.sol`
2. Writes the ABI to `subgraph/abis/Forum.json`
3. Writes the contract address + ABI to `frontend/src/environments/deployment.json`

Update `frontend/src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  rpcUrl: "https://rpc.uzheths.ifi.uzh.ch",
  contractAddress: "0xYOUR_DEPLOYED_ADDRESS",     // ← paste here
  subgraphUrl: "https://api.thegraph.com/subgraphs/name/YOUR_GITHUB/forum-subgraph",
  ipfsGateway: "https://dweb.link/ipfs/",
};
```

---

## 2 — The Graph Subgraph

### Install & configure

```bash
cd subgraph
npm install
```

Edit `subgraph.yaml`:
- Replace `address: "0x0000…"` with the deployed contract address
- Replace `network: mainnet` with `mainnet` (The Graph Hosted Service) or your network slug
- Set `startBlock` to the block the contract was deployed at

### Generate types & build

```bash
npm run codegen
npm run build
```

### Deploy (Hosted Service)

```bash
npm run deploy
```

Follow the prompts to authenticate with your GitHub account on the Hosted Service.  
After deployment, update `subgraphUrl` in `environment.ts` with the actual URL.

---

## 3 — Frontend

### Install dependencies

```bash
cd frontend
npm install
```

### Development server

```bash
npm start
# or
npx ionic serve
```

Runs at `http://localhost:4200`.  
MetaMask will be prompted to switch to UZHETH PoS (chainId 702, RPC https://rpc.uzheths.ifi.uzh.ch).

### Production build

```bash
npm run build
# output in frontend/www/
```

---

## 4 — UZHETH PoS network (local node)

If running a local UZHETH node (lecture setup):

| Parameter | Value |
|-----------|-------|
| RPC HTTP  | `http://127.0.0.1:8549` |
| Chain ID  | 702 |

Update `hardhat.config.js` and `environment.ts` accordingly.

---

## 5 — How it works

### Posting

1. User types a title + body in the frontend.
2. `IpfsService.upload()` stores `{ title, body }` as JSON in the in-browser Helia node, returning a CIDv1 and its 32-byte SHA-256 digest (`bytes32`).
3. `ForumService.createPost(bytes32)` sends a transaction to the contract; only the digest is stored on-chain.
4. The Graph subgraph picks up the `PostCreated` event and indexes the post.

### Reading

- The frontend calls `ForumService.getPosts(offset, limit)` which reads directly from the RPC.
- For each post it calls `IpfsService.fetchByBytes32(hex)` to resolve content from IPFS.
- ENS names are resolved on mainnet (falls back to shortened address on UZHETH).

### Comments & nested replies

- `createComment(postId, parentCommentId=0, bytes32)` creates a top-level comment.
- `createComment(postId, parentCommentId=N, bytes32)` creates a reply to comment N.
- `CommentThreadComponent` recursively renders nested replies (max visual depth 4).

---

## 6 — Project structure

```
contracts/Forum.sol              Smart contract
scripts/deploy.js                Hardhat deploy script
test/Forum.test.js               Contract tests
subgraph/
  subgraph.yaml                  Manifest
  schema.graphql                 Entity schema
  src/mappings.ts                AssemblyScript event handlers
frontend/src/app/
  services/
    web3.service.ts              WalletService (MetaMask, ENS)
    ipfs.service.ts              IpfsService (Helia, CID↔bytes32)
    forum.service.ts             ForumService (contract wrapper)
    subgraph.service.ts          SubgraphService (GraphQL client)
  pages/
    home/                        Feed page
    post-detail/                 Single post + comments
    create-post/                 New post form
  components/
    comment-thread/              Recursive comment component
```
