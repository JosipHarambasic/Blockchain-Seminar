# Decentralised Forum

A production-grade decentralised forum built on:

- **Smart Contract** – Solidity 0.8.28, deployed on UZHETH PoS (chainId 70207)
- **IPFS** – Content pinned through a Kubo/IPFS node, with Helia IndexedDB as a local browser cache
- **Backend** – Express API that pins exact DAG-JSON blocks to Kubo before on-chain writes
- **The Graph** – Off-chain indexing for paginated feeds
- **Frontend** – Angular 20 + Ionic 8, ethers.js v6, standalone components, signals

---

## Architecture

```
User ──► Angular frontend (Ionic)
          │
          ├─ WalletService  ──► MetaMask / ethers.js v6
          ├─ IpfsService    ──► backend/ API ──► Kubo/IPFS node
          │                         │
          │                         └─ pins { title, body } DAG-JSON blocks
          ├─ Helia cache    ──► IndexedDB local browser cache
          ├─ ForumService   ──► Forum.sol (via ethers.js)
          └─ SubgraphService──► The Graph GraphQL endpoint
                                     │
Forum.sol ◄──────────────────────────┘
  (UZHETH PoS, chainId 70207)
  stores: bytes32 contentHash (SHA-256 of JSON via IPFS CIDv1)

Kubo/IPFS
  pins: { title, body } DAG-JSON blocks, addressed by CIDv1 / bytes32
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 |
| npm | ≥ 10 |
| MetaMask | latest |
| Kubo/IPFS | local daemon with HTTP API on port 5001 |
| graph-cli | installed by `npm install` in `subgraph/` |

---

## 1 — Smart Contract

### Install dependencies

```bash
npm install          # root — installs Hardhat etc.
```

### Configure environment

Copy `.env.example` to `.env` (create it if absent):

```
UZHETH_POS_RPC_URL=http://130.60.144.77:8554
UZHETH_POS_CHAIN_ID=70207
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
3. Writes deployment metadata to `frontend/src/environments/deployment.json`

Update `frontend/src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  networkChainId: 70207,
  rpcUrl: "http://130.60.144.77:8554",
  contractAddress: "0xYOUR_DEPLOYED_ADDRESS",     // ← paste here
  subgraphUrl: "https://api.thegraph.com/subgraphs/name/YOUR_GITHUB/forum-subgraph",
  ipfsGateway: "https://dweb.link/ipfs/",
  ipfsPinningEndpoint: "http://127.0.0.1:3000/api/ipfs/pin",
};
```

---

## 2 — IPFS Node And Backend

The frontend must pin content publicly before it stores the content hash on-chain. For local development, run a Kubo/IPFS node locally and start the backend API in this repo.

### Start Kubo/IPFS

Install Kubo externally, then initialize it once:

```bash
ipfs init
```

Start the IPFS daemon:

```bash
ipfs daemon
```

Keep this process running. The backend expects the Kubo HTTP API at:

```text
http://127.0.0.1:5001
```

### Install and start the backend

In a second terminal:

```bash
cd backend
npm install
cp .env.example .env
npm start
```

The backend runs at `http://127.0.0.1:3000` and exposes:

```text
POST http://127.0.0.1:3000/api/ipfs/pin
```

It recomputes the DAG-JSON CID server-side, pins the block through Kubo, and rejects uploads if the frontend-computed CID or `bytes32` digest does not match.

For production, `frontend/src/environments/environment.prod.ts` uses `/api/ipfs/pin`. Put the backend behind the same domain with a reverse proxy so that path reaches the backend.

---

## 3 — The Graph Subgraph

### Install & configure

```bash
cd subgraph
npm install
```

Edit `subgraph/subgraph.yaml`:
- Set `source.address` to the deployed contract address
- Set `network` to the target Graph network slug, for example `uzhethereum`
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

## 4 — Frontend

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
MetaMask will be prompted to switch to UZHETH PoS (chainId 70207, RPC http://130.60.144.77:8554).

Before creating posts or comments, make sure both of these are running:

- Kubo/IPFS daemon on `http://127.0.0.1:5001`
- Backend API on `http://127.0.0.1:3000`

### Production build

```bash
npm run build
# output in frontend/www/
```

---

## 5 — Local Hardhat Network

If running a local Hardhat node:

| Parameter | Value |
|-----------|-------|
| RPC HTTP  | `http://127.0.0.1:8545` |
| Network   | `localhost` |

Use these commands from the root package:

```bash
npm run node
npm run deploy:local
```

Then update `frontend/src/environments/environment.ts` with the local contract address and RPC URL if you want the frontend to use the local chain.

---

## 6 — How it works

### Posting

1. User types a title + body in the frontend.
2. `IpfsService.upload()` encodes `{ title, body }` as DAG-JSON and computes a CIDv1 plus its 32-byte SHA-256 digest (`bytes32`).
3. The block is cached in the browser's Helia IndexedDB blockstore.
4. The frontend calls `POST /api/ipfs/pin`; the backend pins the exact DAG-JSON block through Kubo.
5. After pinning succeeds, `ForumService.createPost(bytes32)` sends a transaction to the contract; only the digest is stored on-chain.
6. The Graph subgraph picks up the `PostCreated` event and indexes the post.

### Reading

- The frontend calls `ForumService.getPosts(offset, limit)` which reads directly from the RPC.
- For each post it calls `IpfsService.fetchByBytes32(hex)` to reconstruct the CID and resolve content from the local Helia cache or the configured IPFS gateway.
- ENS names are resolved on mainnet (falls back to shortened address on UZHETH).

### Comments & nested replies

- `createComment(postId, parentCommentId=0, bytes32)` creates a top-level comment.
- `createComment(postId, parentCommentId=N, bytes32)` creates a reply to comment N.
- `CommentThreadComponent` recursively renders nested replies (max visual depth 4).

---

## 7 — Project structure

```
contracts/Forum.sol              Smart contract
scripts/deploy.js                Hardhat deploy script
test/Forum.test.js               Contract tests
backend/
  src/server.js                  Express API for pinning DAG-JSON blocks to Kubo
  .env.example                   Backend config template
subgraph/
  subgraph.yaml                  Manifest
  schema.graphql                 Entity schema
  src/mappings.ts                AssemblyScript event handlers
frontend/src/app/
  services/
    web3.service.ts              WalletService (MetaMask, ENS)
    ipfs.service.ts              IpfsService (Helia cache, backend pinning, CID↔bytes32)
    forum.service.ts             ForumService (contract wrapper)
    subgraph.service.ts          SubgraphService (GraphQL client)
  pages/
    home/                        Feed page
    post-detail/                 Single post + comments
    create-post/                 New post form
  components/
    comment-thread/              Recursive comment component
```
