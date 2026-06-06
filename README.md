# Decentralised Forum

A decentralised forum built on:

- **Smart Contract** – Solidity 0.8.28, deployed on UZHETH PoS (chainId 70207)
- **IPFS** – Content pinned through a local Kubo node; Helia IndexedDB used as an in-browser cache
- **Backend** – Express API that pins DAG-JSON blocks to Kubo before the content hash goes on-chain
- **Frontend** – Angular 20 + Ionic 8, ethers.js v6, standalone components, signals

---

## Architecture

```
User ──► Angular frontend (Ionic 8)
          │
          ├─ WalletService   ──► MetaMask (ethers.js v6)
          ├─ IpfsService     ──► Backend API  ──► Kubo/IPFS daemon (:5001)
          │   └─ Helia cache ──► IndexedDB (browser)
          └─ ForumService    ──► Forum.sol on UZHETH PoS

Forum.sol  (UZHETH PoS, chainId 70207, RPC http://130.60.144.77:8554)
  └─ stores bytes32 contentHash = SHA-256 of DAG-JSON { title, body }

Kubo/IPFS  (:5001)  —  pins the exact DAG-JSON blocks
```

---

## Prerequisites

| Tool | Notes |
|------|-------|
| Node.js ≥ 20 | |
| npm ≥ 10 | |
| MetaMask | browser extension |
| Kubo (IPFS) | `brew install ipfs` on macOS |

---

## Running locally — step by step

You need **three processes** running at the same time.

---

### 1 — IPFS daemon

Initialize once (skip if already done):

```bash
ipfs init
```

Start and leave running:

```bash
ipfs daemon
```

Kubo listens on `http://127.0.0.1:5001`.

---

### 2 — Backend (IPFS pinning API)

```bash
cd backend
npm install
cp .env.example .env   # defaults are correct for local dev
npm start
```

API listens on `http://127.0.0.1:3000`.  
It accepts `POST /api/ipfs/pin`, pins the DAG-JSON block via Kubo, and verifies the CID.

---

### 3 — Smart contract

#### Install root dependencies (once)

```bash
npm install
```

#### Set deployer private key

```bash
cp .env.example .env
```

Edit `.env`:

```
DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
```

> Export the key from MetaMask → account menu → *Account details* → *Show private key*.

#### Compile, test, deploy

```bash
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.js --network uzheth_pos
```

The script prints the deployed address and writes:
- `frontend/src/environments/deployment.json`

#### Update environment.ts

Open `frontend/src/environments/environment.ts` and paste the printed address:

```typescript
contractAddress: "0xYOUR_DEPLOYED_ADDRESS",
```

---

### 4 — Frontend

```bash
cd frontend
npm install
npm start
```

Opens at `http://localhost:4200`.  
MetaMask will prompt you to add/switch to UZHETH PoS (chainId 70207, RPC `http://130.60.144.77:8554`).

---

## Quick-start checklist

```
[ ] ipfs daemon                          running on :5001
[ ] cd backend && npm start              running on :3000
[ ] npx hardhat run scripts/deploy.js --network uzheth_pos   contract deployed, address copied to environment.ts
[ ] cd frontend && npm start             app on :4200
```

---

## How it works

### Posting

1. User types a title + body.
2. `IpfsService.upload()` encodes `{ title, body }` as DAG-JSON and extracts the 32-byte SHA-256 digest (bytes32).
3. The block is cached in the browser's Helia IndexedDB store.
4. The frontend POSTs the raw block to `http://127.0.0.1:3000/api/ipfs/pin`; the backend pins it via Kubo.
5. `ForumService.createPost(bytes32)` sends the transaction — only the digest is stored on-chain.

### Reading

- `ForumService.getPosts(offset, limit)` reads directly from the RPC node.
- `IpfsService.fetchByBytes32(hex)` reconstructs the CID and fetches content from the local Helia cache or the configured IPFS gateway.
- ENS names are attempted via the connected provider (always falls back to a shortened address on UZHETH PoS, which has no ENS registry).

### Comments & nested replies

- `createComment(postId, parentCommentId=0, bytes32)` — top-level comment.
- `createComment(postId, parentCommentId=N, bytes32)` — reply to comment N.
- `CommentThreadComponent` renders nested replies recursively (max visual depth 4).

---

## Project structure

```
contracts/Forum.sol              Smart contract (Solidity 0.8.28)
scripts/deploy.js                Hardhat deploy script
test/Forum.test.js               Contract tests
backend/
  src/server.js                  Express pinning API
  .env.example                   Config template
frontend/src/app/
  services/
    web3.service.ts              WalletService — MetaMask, ENS, signals
    ipfs.service.ts              IpfsService — Helia cache, backend pinning, CID↔bytes32
    forum.service.ts             ForumService — contract wrapper
  pages/
    home/                        Feed page
    post-detail/                 Single post + threaded comments
    create-post/                 New post form
  components/
    comment-thread/              Recursive comment + reply component
```
