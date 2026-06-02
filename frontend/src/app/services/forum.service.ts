/**
 * ForumService
 *
 * Wraps the Forum smart contract via ethers.js v6.  Uses a read-only
 * JsonRpcProvider for queries so they work before the user connects, and
 * switches to the connected Signer for write transactions.
 *
 * Content (title + body) is NOT stored on-chain — it lives on IPFS.  The
 * service delegates to IpfsService for upload / fetch and only sends the
 * 32-byte digest on-chain.
 */
import { Injectable } from "@angular/core";
import { ethers } from "ethers";
import { WalletService } from "./web3.service";
import { IpfsService } from "./ipfs.service";
import { environment } from "../../environments/environment";

// ─── Display models ──────────────────────────────────────────────────────────

export interface PostDisplay {
  id:                 number;
  author:             string;
  authorDisplay:      string;  // ENS name or shortened address
  contentHash:        string;  // bytes32 hex (0x…)
  title:              string;  // resolved from IPFS
  body:               string;
  timestamp:          number;
  timestampFormatted: string;
  likeCount:          number;
  commentCount:       number;
  liked:              boolean;
}

export interface CommentDisplay {
  id:                 number;
  postId:             number;
  parentCommentId:    number;
  author:             string;
  authorDisplay:      string;
  contentHash:        string;
  title:              string;
  body:               string;
  timestamp:          number;
  timestampFormatted: string;
  likeCount:          number;
  liked:              boolean;
  replyCount?:        number;  // populated lazily by CommentThreadComponent
  replies?:           CommentDisplay[];
}

// ─── ABI ─────────────────────────────────────────────────────────────────────
// Human-readable ABI string form — compact and easy to maintain.

const FORUM_ABI: ethers.InterfaceAbi = [
  // ── write ────────────────────────────────────────────────────────────────
  "function createPost(bytes32 contentHash) returns (uint256)",
  "function createComment(uint256 postId, uint256 parentCommentId, bytes32 contentHash) returns (uint256)",
  "function likePost(uint256 postId)",
  "function likeComment(uint256 commentId)",
  // ── read ─────────────────────────────────────────────────────────────────
  "function getPosts(uint256 offset, uint256 limit) view returns (tuple(uint256 id, address author, bytes32 contentHash, uint256 timestamp, uint256 likeCount, uint256 commentCount)[] posts, uint256 total)",
  "function getPost(uint256 postId) view returns (tuple(uint256 id, address author, bytes32 contentHash, uint256 timestamp, uint256 likeCount, uint256 commentCount))",
  "function getPostComments(uint256 postId) view returns (tuple(uint256 id, uint256 postId, uint256 parentCommentId, address author, bytes32 contentHash, uint256 timestamp, uint256 likeCount)[])",
  "function getCommentReplies(uint256 commentId) view returns (tuple(uint256 id, uint256 postId, uint256 parentCommentId, address author, bytes32 contentHash, uint256 timestamp, uint256 likeCount)[])",
  "function hasLikedPost(address user, uint256 postId) view returns (bool)",
  "function hasLikedComment(address user, uint256 commentId) view returns (bool)",
  "function postCount() view returns (uint256)",
  "function commentCount() view returns (uint256)",
  // ── events ───────────────────────────────────────────────────────────────
  "event PostCreated(uint256 indexed postId, address indexed author, bytes32 contentHash, uint256 timestamp)",
  "event CommentCreated(uint256 indexed commentId, uint256 indexed postId, uint256 parentCommentId, address author, bytes32 contentHash, uint256 timestamp)",
  "event PostLiked(uint256 indexed postId, address indexed liker, uint256 newLikeCount)",
  "event CommentLiked(uint256 indexed commentId, address indexed liker, uint256 newLikeCount)",
];

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: "root" })
export class ForumService {
  private _readContract:  ethers.Contract | null = null;
  private _writeContract: ethers.Contract | null = null;

  constructor(
    private wallet: WalletService,
    private ipfs:   IpfsService,
  ) {
    this._initRead();
  }

  // ─── Initialisation ───────────────────────────────────────────────────────

  private _initRead(): void {
    try {
      const provider = new ethers.JsonRpcProvider(environment.rpcUrl);
      this._readContract = new ethers.Contract(environment.contractAddress, FORUM_ABI, provider);
    } catch { /* RPC unreachable on startup */ }
  }

  /** Call after wallet connects to upgrade read/write contracts to the signer. */
  connectSigner(): void {
    const signer = this.wallet.getSigner();
    if (!signer) return;
    this._writeContract = new ethers.Contract(environment.contractAddress, FORUM_ABI, signer);
    this._readContract  = new ethers.Contract(environment.contractAddress, FORUM_ABI, signer);
  }

  private _read(): ethers.Contract {
    if (!this._readContract) this._initRead();
    if (!this._readContract) throw new Error("Contract not initialised — check contractAddress in environment.ts");
    return this._readContract;
  }

  private _write(): ethers.Contract {
    if (!this._writeContract) throw new Error("Wallet not connected. Please connect MetaMask first.");
    return this._writeContract;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private _fmt(ts: number): string {
    return new Date(ts * 1000).toLocaleString();
  }

  private async _displayAddr(address: string): Promise<string> {
    try {
      const ens = await this._read().runner?.provider?.lookupAddress(address);
      if (ens) return ens;
    } catch { /* ignore */ }
    return this.wallet.shortenAddress(address);
  }

  private async _mapRawPost(raw: any, userAddr: string | null): Promise<PostDisplay> {
    const liked   = userAddr ? await this._read().hasLikedPost(userAddr, raw.id) : false;
    const hashHex = raw.contentHash as string;
    let title = "(loading…)", body = "";
    try {
      const c = await this.ipfs.fetchByBytes32(hashHex);
      title = c.title; body = c.body;
    } catch { /* IPFS not yet available */ }
    return {
      id: Number(raw.id), author: raw.author as string,
      authorDisplay: await this._displayAddr(raw.author),
      contentHash: hashHex, title, body,
      timestamp: Number(raw.timestamp),
      timestampFormatted: this._fmt(Number(raw.timestamp)),
      likeCount: Number(raw.likeCount),
      commentCount: Number(raw.commentCount), liked,
    };
  }

  private async _mapRawComment(raw: any, userAddr: string | null): Promise<CommentDisplay> {
    const liked   = userAddr ? await this._read().hasLikedComment(userAddr, raw.id) : false;
    const hashHex = raw.contentHash as string;
    let title = "", body = "(loading…)";
    try {
      const c = await this.ipfs.fetchByBytes32(hashHex);
      title = c.title ?? ""; body = c.body;
    } catch { /* ignore */ }
    return {
      id: Number(raw.id), postId: Number(raw.postId),
      parentCommentId: Number(raw.parentCommentId),
      author: raw.author as string,
      authorDisplay: await this._displayAddr(raw.author),
      contentHash: hashHex, title, body,
      timestamp: Number(raw.timestamp),
      timestampFormatted: this._fmt(Number(raw.timestamp)),
      likeCount: Number(raw.likeCount), liked,
    };
  }

  // ─── Read methods ─────────────────────────────────────────────────────────

  async getPosts(offset: number, limit: number): Promise<{ posts: PostDisplay[]; total: number }> {
    const userAddr = this.wallet.address();
    const [raws, total]: [any[], bigint] = await this._read().getPosts(offset, limit);
    const posts = await Promise.all(raws.map((r) => this._mapRawPost(r, userAddr)));
    return { posts, total: Number(total) };
  }

  async getPost(postId: number): Promise<PostDisplay> {
    const userAddr = this.wallet.address();
    const raw = await this._read().getPost(postId);
    return this._mapRawPost(raw, userAddr);
  }

  async getPostComments(postId: number): Promise<CommentDisplay[]> {
    const userAddr = this.wallet.address();
    const raws: any[] = await this._read().getPostComments(postId);
    return Promise.all(raws.map((r) => this._mapRawComment(r, userAddr)));
  }

  async getCommentReplies(commentId: number): Promise<CommentDisplay[]> {
    const userAddr = this.wallet.address();
    const raws: any[] = await this._read().getCommentReplies(commentId);
    return Promise.all(raws.map((r) => this._mapRawComment(r, userAddr)));
  }

  // ─── Write methods ────────────────────────────────────────────────────────

  /** Uploads to IPFS then calls createPost on-chain. Returns the new post ID. */
  async createPost(title: string, body: string): Promise<number> {
    const { bytes32 } = await this.ipfs.upload({ title, body });
    const tx = await this._write().createPost(bytes32);
    const receipt = await tx.wait();
    const iface = this._write().interface;
    for (const log of receipt.logs) {
      try {
        const p = iface.parseLog(log);
        if (p?.name === "PostCreated") return Number(p.args.postId);
      } catch { /* skip */ }
    }
    return 0;
  }

  /** Uploads to IPFS then calls createComment. parentCommentId=0 for top-level. */
  async createComment(postId: number, parentCommentId: number, body: string): Promise<number> {
    const { bytes32 } = await this.ipfs.upload({ title: "", body });
    const tx = await this._write().createComment(postId, parentCommentId, bytes32);
    const receipt = await tx.wait();
    const iface = this._write().interface;
    for (const log of receipt.logs) {
      try {
        const p = iface.parseLog(log);
        if (p?.name === "CommentCreated") return Number(p.args.commentId);
      } catch { /* skip */ }
    }
    return 0;
  }

  async likePost(postId: number): Promise<void> {
    const tx = await this._write().likePost(postId);
    await tx.wait();
  }

  async likeComment(commentId: number): Promise<void> {
    const tx = await this._write().likeComment(commentId);
    await tx.wait();
  }
}
