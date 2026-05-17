import { Injectable } from "@angular/core";
import { ethers } from "ethers";
import { Web3Service } from "./web3.service";
import { environment } from "../../environments/environment";

// ─── Display models (bigint converted to number for template usage) ──────────

export interface PostDisplay {
  id: number;
  author: string;
  authorShort: string;
  title: string;
  body: string;
  timestamp: number;
  timestampFormatted: string;
  likeCount: number;
  commentCount: number;
  liked: boolean;
}

export interface CommentDisplay {
  id: number;
  postId: number;
  author: string;
  authorShort: string;
  body: string;
  timestamp: number;
  timestampFormatted: string;
  likeCount: number;
  liked: boolean;
}

// ─── Contract ABI (matches Forum.sol) ───────────────────────────────────────

const FORUM_ABI: ethers.InterfaceAbi = [
  // ── Write functions ──────────────────────────────────────────────────────
  {
    inputs: [
      { internalType: "string", name: "_title", type: "string" },
      { internalType: "string", name: "_body",  type: "string" },
    ],
    name: "createPost",
    outputs: [{ internalType: "uint256", name: "postId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "_postId", type: "uint256" },
      { internalType: "string",  name: "_body",   type: "string"  },
    ],
    name: "createComment",
    outputs: [{ internalType: "uint256", name: "commentId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "_postId", type: "uint256" }],
    name: "likePost",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "_commentId", type: "uint256" }],
    name: "likeComment",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // ── Read functions ───────────────────────────────────────────────────────
  {
    inputs: [],
    name: "getAllPosts",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "id",           type: "uint256" },
          { internalType: "address", name: "author",       type: "address" },
          { internalType: "string",  name: "title",        type: "string"  },
          { internalType: "string",  name: "body",         type: "string"  },
          { internalType: "uint256", name: "timestamp",    type: "uint256" },
          { internalType: "uint256", name: "likeCount",    type: "uint256" },
          { internalType: "uint256", name: "commentCount", type: "uint256" },
        ],
        internalType: "struct Forum.Post[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "_postId", type: "uint256" }],
    name: "getPost",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "id",           type: "uint256" },
          { internalType: "address", name: "author",       type: "address" },
          { internalType: "string",  name: "title",        type: "string"  },
          { internalType: "string",  name: "body",         type: "string"  },
          { internalType: "uint256", name: "timestamp",    type: "uint256" },
          { internalType: "uint256", name: "likeCount",    type: "uint256" },
          { internalType: "uint256", name: "commentCount", type: "uint256" },
        ],
        internalType: "struct Forum.Post",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "_postId", type: "uint256" }],
    name: "getPostComments",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "id",        type: "uint256" },
          { internalType: "uint256", name: "postId",    type: "uint256" },
          { internalType: "address", name: "author",    type: "address" },
          { internalType: "string",  name: "body",      type: "string"  },
          { internalType: "uint256", name: "timestamp", type: "uint256" },
          { internalType: "uint256", name: "likeCount", type: "uint256" },
        ],
        internalType: "struct Forum.Comment[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "_user",   type: "address" },
      { internalType: "uint256", name: "_postId", type: "uint256" },
    ],
    name: "hasLikedPost",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "_user",      type: "address" },
      { internalType: "uint256", name: "_commentId", type: "uint256" },
    ],
    name: "hasLikedComment",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  { inputs: [], name: "postCount",    outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "commentCount", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  // ── Events ───────────────────────────────────────────────────────────────
  {
    anonymous: false,
    inputs: [
      { indexed: true,  internalType: "uint256", name: "postId",    type: "uint256" },
      { indexed: true,  internalType: "address", name: "author",    type: "address" },
      { indexed: false, internalType: "string",  name: "title",     type: "string"  },
      { indexed: false, internalType: "uint256", name: "timestamp", type: "uint256" },
    ],
    name: "PostCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true,  internalType: "uint256", name: "commentId", type: "uint256" },
      { indexed: true,  internalType: "uint256", name: "postId",    type: "uint256" },
      { indexed: true,  internalType: "address", name: "author",    type: "address" },
      { indexed: false, internalType: "uint256", name: "timestamp", type: "uint256" },
    ],
    name: "CommentCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true,  internalType: "uint256", name: "postId",       type: "uint256" },
      { indexed: true,  internalType: "address", name: "liker",        type: "address" },
      { indexed: false, internalType: "uint256", name: "newLikeCount", type: "uint256" },
    ],
    name: "PostLiked",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true,  internalType: "uint256", name: "commentId",    type: "uint256" },
      { indexed: true,  internalType: "address", name: "liker",        type: "address" },
      { indexed: false, internalType: "uint256", name: "newLikeCount", type: "uint256" },
    ],
    name: "CommentLiked",
    type: "event",
  },
];

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: "root" })
export class ForumService {
  // We hold two contract instances: a read-only one (provider) and a write one (signer).
  // The read-only instance is initialised from the public RPC so posts are visible
  // even before the user connects their wallet.
  private readContract: ethers.Contract | null = null;
  private writeContract: ethers.Contract | null = null;

  constructor(private web3: Web3Service) {
    // Initialise read-only contract with the public RPC
    this.initReadContract();

    // When the account connects/changes, wire up the write contract
    this.web3.account$.subscribe((account) => {
      if (account) {
        this.initWriteContract();
      } else {
        this.writeContract = null;
      }
    });
  }

  private initReadContract(): void {
    try {
      const provider = new ethers.JsonRpcProvider(environment.rpcUrl);
      this.readContract = new ethers.Contract(
        environment.contractAddress,
        FORUM_ABI,
        provider
      );
    } catch {
      // RPC might not be reachable in dev — will retry after wallet connect
    }
  }

  private initWriteContract(): void {
    const signer = this.web3.getSigner();
    if (signer) {
      this.writeContract = new ethers.Contract(
        environment.contractAddress,
        FORUM_ABI,
        signer
      );
      // Use the signer's provider for reads too (keeps everything in sync)
      this.readContract = new ethers.Contract(
        environment.contractAddress,
        FORUM_ABI,
        signer
      );
    }
  }

  private getRead(): ethers.Contract {
    if (!this.readContract) throw new Error("Contract not initialised");
    return this.readContract;
  }

  private getWrite(): ethers.Contract {
    if (!this.writeContract)
      throw new Error("Wallet not connected. Please connect MetaMask first.");
    return this.writeContract;
  }

  // ─── Mapping helpers ──────────────────────────────────────────────────────

  private mapPost(raw: any, liked = false): PostDisplay {
    const ts = Number(raw.timestamp);
    return {
      id:                 Number(raw.id),
      author:             raw.author,
      authorShort:        this.web3.shortenAddress(raw.author),
      title:              raw.title,
      body:               raw.body,
      timestamp:          ts,
      timestampFormatted: this.web3.formatTimestamp(ts),
      likeCount:          Number(raw.likeCount),
      commentCount:       Number(raw.commentCount),
      liked,
    };
  }

  private mapComment(raw: any, liked = false): CommentDisplay {
    const ts = Number(raw.timestamp);
    return {
      id:                 Number(raw.id),
      postId:             Number(raw.postId),
      author:             raw.author,
      authorShort:        this.web3.shortenAddress(raw.author),
      body:               raw.body,
      timestamp:          ts,
      timestampFormatted: this.web3.formatTimestamp(ts),
      likeCount:          Number(raw.likeCount),
      liked,
    };
  }

  // ─── Read methods ─────────────────────────────────────────────────────────

  /**
   * Fetches all posts and enriches each with the current user's like status.
   */
  async getAllPosts(): Promise<PostDisplay[]> {
    const raws: any[] = await this.getRead().getAllPosts();
    const account = this.web3.getCurrentAccount();

    const posts = await Promise.all(
      raws.map(async (raw) => {
        let liked = false;
        if (account) {
          liked = await this.getRead().hasLikedPost(account, raw.id);
        }
        return this.mapPost(raw, liked);
      })
    );

    // Return newest first
    return posts.reverse();
  }

  /**
   * Fetches a single post by ID.
   */
  async getPost(postId: number): Promise<PostDisplay> {
    const raw = await this.getRead().getPost(postId);
    const account = this.web3.getCurrentAccount();
    let liked = false;
    if (account) {
      liked = await this.getRead().hasLikedPost(account, postId);
    }
    return this.mapPost(raw, liked);
  }

  /**
   * Fetches all comments for a post with like status for the current user.
   */
  async getPostComments(postId: number): Promise<CommentDisplay[]> {
    const raws: any[] = await this.getRead().getPostComments(postId);
    const account = this.web3.getCurrentAccount();

    return Promise.all(
      raws.map(async (raw) => {
        let liked = false;
        if (account) {
          liked = await this.getRead().hasLikedComment(account, raw.id);
        }
        return this.mapComment(raw, liked);
      })
    );
  }

  // ─── Write methods ────────────────────────────────────────────────────────

  /**
   * Submits a new post transaction and waits for it to be mined.
   */
  async createPost(title: string, body: string): Promise<void> {
    const tx = await this.getWrite().createPost(title, body);
    await tx.wait();
  }

  /**
   * Submits a new comment transaction and waits for it to be mined.
   */
  async createComment(postId: number, body: string): Promise<void> {
    const tx = await this.getWrite().createComment(postId, body);
    await tx.wait();
  }

  /**
   * Likes a post transaction and waits for it to be mined.
   */
  async likePost(postId: number): Promise<void> {
    const tx = await this.getWrite().likePost(postId);
    await tx.wait();
  }

  /**
   * Likes a comment transaction and waits for it to be mined.
   */
  async likeComment(commentId: number): Promise<void> {
    const tx = await this.getWrite().likeComment(commentId);
    await tx.wait();
  }
}
