# Decentralized Forum DApp — Task 12

A full-stack decentralised forum where all posts, comments, and likes are stored on-chain.  
Built with **Solidity + Hardhat** (smart contract) and **Ionic Angular + ethers.js** (frontend).

---

## Project structure

```
decentralized-forum/
├── contracts/
│   └── Forum.sol                     # Solidity smart contract
├── scripts/
│   └── deploy.js                     # Hardhat deployment script
├── test/
│   └── Forum.test.js                 # Hardhat/Chai test suite
├── hardhat.config.js
├── package.json
├── .env.example                      # Copy to .env and fill in secrets
└── frontend/                         # Ionic Angular app
    ├── src/
    │   ├── app/
    │   │   ├── services/
    │   │   │   ├── web3.service.ts   # MetaMask / ethers.js connection
    │   │   │   └── forum.service.ts  # Contract interactions + display models
    │   │   └── pages/
    │   │       ├── home/             # Post list + create-post modal
    │   │       └── post-detail/      # Post body, comments, add-comment form
    │   └── environments/
    │       └── environment.ts        # ← update contractAddress here
    ├── angular.json
    ├── webpack.config.js             # Node.js polyfills for ethers.js
    └── package.json
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| npm | ≥ 9 |
| MetaMask browser extension | latest |
| (optional) Ionic CLI | `npm i -g @ionic/cli` |

---

## 1 — Smart contract

### Install dependencies

```bash
# from repo root
npm install
```

### Compile

```bash
npm run compile
```

### Run tests

```bash
npm test
```

### Deploy to a local Hardhat node (for development)

```bash
# Terminal 1 — start local node
npm run node

# Terminal 2 — deploy
npm run deploy:local
```

### Deploy to UZHETH PoS

1. Copy `.env.example` to `.env` and fill in your private key and the network details:
   ```
   DEPLOYER_PRIVATE_KEY=<your key without 0x>
   UZHETH_POS_RPC_URL=https://rpc.uzheths.ifi.uzh.ch
   UZHETH_POS_CHAIN_ID=702          # confirm with course materials
   ```
2. Run:
   ```bash
   npm run deploy:uzheth
   ```
3. Copy the printed contract address.

---

## 2 — Frontend

### Install dependencies

```bash
cd frontend
npm install
```

### Configure the contract address

Edit `frontend/src/environments/environment.ts` and replace the placeholder:

```typescript
contractAddress: "0xYourDeployedContractAddress",
networkChainId: 702,           // match your UZHETH PoS chain ID
rpcUrl: "https://rpc.uzheths.ifi.uzh.ch",
```

### Run development server

```bash
# inside frontend/
npm start
# or: ionic serve
```

Open [http://localhost:4200](http://localhost:4200) in a browser that has MetaMask installed.

### Build for production

```bash
npm run build:prod
# output in frontend/www/
```

---

## 3 — Using the DApp

1. **Connect wallet** — click *Connect* in the top toolbar; MetaMask will prompt you to connect and switch to the UZHETH PoS network automatically.
2. **Browse posts** — the home screen lists all posts in reverse-chronological order.
3. **Create a post** — press the **+** FAB button (bottom-right), fill in a title and body, click *Publish Post* and confirm the transaction in MetaMask.
4. **Read a post** — tap any post card to open the detail view.
5. **Like a post / comment** — click the heart icon. Each address can only like once (enforced on-chain).
6. **Comment on a post** — scroll to *Leave a Comment* at the bottom of a post detail page, write your message and click *Post Comment*.

---

## 4 — Contract overview

| Function | Description |
|----------|-------------|
| `createPost(title, body)` | Creates a new post |
| `createComment(postId, body)` | Adds a comment to a post |
| `likePost(postId)` | Likes a post (once per address) |
| `likeComment(commentId)` | Likes a comment (once per address) |
| `getAllPosts()` | Returns all posts |
| `getPost(postId)` | Returns a single post |
| `getPostComments(postId)` | Returns all comments for a post |
| `hasLikedPost(user, postId)` | Whether a user has liked a post |
| `hasLikedComment(user, commentId)` | Whether a user has liked a comment |

---

## 5 — Limitations & possible improvements

- **Pagination**: `getAllPosts()` returns everything in one call; for large datasets this is gas-expensive. A cursor-based query or off-chain indexer would be more scalable.
- **Content moderation**: there is no on-chain moderation mechanism; all posts are permanent.
- **IPFS attachments**: posts currently contain plain text only. Images could be stored on IPFS with the CID recorded on-chain.
- **Notifications**: the frontend polls on page load; a WebSocket/event listener could enable real-time updates.
- **Gas optimisation**: storing full post/comment text on-chain is costly. Storing only a content-hash (with IPFS for the full text) would drastically reduce costs in a production setting.

---

## Author contributions

The authors conceived, developed and wrote this project based on the course materials and Solidity/ethers.js documentation. The project was produced abiding to the rules of student conduct and anti-plagiarism.
