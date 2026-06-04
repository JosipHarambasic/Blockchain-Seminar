/**
 * IpfsService
 *
 * Wraps Helia (the modern JS IPFS implementation) to upload and fetch JSON
 * objects.  Content is stored as dag-json CIDv1 blocks in an IndexedDB
 * blockstore so the in-browser node persists across page loads.
 *
 * CID ↔ bytes32 conversion
 * ─────────────────────────
 * A dag-json CIDv1 with sha2-256 contains a 32-byte raw digest.  We store
 * only that digest on-chain as bytes32, then reconstruct the full CID from it
 * when reading.  This saves calldata gas and is perfectly reversible.
 */
import { Injectable } from "@angular/core";
import { environment } from "../../environments/environment";

// All Helia imports are dynamic to avoid bundler issues with pure-ESM packages.
// Types are imported statically for TypeScript — they are erased at compile time.
import type { Helia }       from "helia";
import type { CID }         from "multiformats/cid";

export interface IpfsContent {
  title: string;
  body:  string;
}

interface PinningResponse {
  cid:     string;
  bytes32: string;
}

@Injectable({ providedIn: "root" })
export class IpfsService {
  private _helia:    Helia      | null = null;
  private _initPromise: Promise<void> | null = null;

  // ─── Initialisation ─────────────────────────────────────────────────────────

  /**
   * Lazily initialises a Helia node backed by IndexedDB.  Called automatically
   * by upload/fetch — callers do not need to await this directly.
   */
  private async _init(): Promise<void> {
    if (this._helia) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      // Dynamic imports keep Helia's pure-ESM graph out of the initial bundle.
      const [
        { createHelia },
        { IDBBlockstore },
        { IDBDatastore },
      ] = await Promise.all([
        import("helia"),
        import("blockstore-idb"),
        import("datastore-idb"),
      ]);

      const blockstore = new IDBBlockstore("forum-helia-blocks");
      const datastore  = new IDBDatastore("forum-helia-data");

      await blockstore.open();
      await datastore.open();

      // DAG-JSON upload/read only needs the local blockstore. Starting libp2p in
      // the browser makes Helia dial WebTransport/QUIC peers, which can crash Brave.
      this._helia = await createHelia({
        blockstore,
        datastore,
        blockBrokers: [],
        start: false,
      });
    })();

    return this._initPromise;
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Uploads a post/comment content object to IPFS and returns the bytes32
   * digest suitable for storing on-chain.
   */
  async upload(content: IpfsContent): Promise<{ cid: string; bytes32: string }> {
    await this._init();

    const [{ CID }, { sha256 }, dagJson] = await Promise.all([
      import("multiformats/cid"),
      import("multiformats/hashes/sha2"),
      import("@ipld/dag-json"),
    ]);

    const block   = dagJson.encode(content);
    const hash    = await sha256.digest(block);
    const cid     = CID.createV1(dagJson.code, hash);

    await this._helia!.blockstore.put(cid, block);
    const bytes32 = this.cidToBytes32(cid);
    await this._pinPublicly(content, cid.toString(), bytes32);
    return { cid: cid.toString(), bytes32 };
  }

  /**
   * Pins the same DAG-JSON content through the backend before any transaction
   * stores its digest on-chain.
   */
  private async _pinPublicly(content: IpfsContent, cid: string, bytes32: string): Promise<void> {
    const endpoint = environment.ipfsPinningEndpoint;
    if (!endpoint) throw new Error("IPFS pinning endpoint is not configured");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...content, cid, bytes32 }),
    });

    let payload: Partial<PinningResponse> & { error?: string } = {};
    try {
      payload = await response.json();
    } catch { /* backend may return non-JSON errors */ }

    if (!response.ok) {
      throw new Error(payload.error || `IPFS pinning failed with HTTP ${response.status}`);
    }

    if (payload.cid !== cid) {
      throw new Error(`IPFS pinning CID mismatch: backend returned ${payload.cid}, expected ${cid}`);
    }

    if (payload.bytes32?.toLowerCase() !== bytes32.toLowerCase()) {
      throw new Error(`IPFS pinning digest mismatch: backend returned ${payload.bytes32}, expected ${bytes32}`);
    }
  }

  /**
   * Fetches and decodes a JSON object from IPFS by its CID string.
   * Falls back to the public gateway if the local node does not have the block.
   */
  async fetch(cidString: string): Promise<IpfsContent> {
    await this._init();
    const [{ CID }, dagJson] = await Promise.all([
      import("multiformats/cid"),
      import("@ipld/dag-json"),
    ]);

    const cid = CID.parse(cidString);
    try {
      const block = await this._helia!.blockstore.get(cid, { offline: true });
      return dagJson.decode(block) as IpfsContent;
    } catch (err) {
      const gateway = environment.ipfsGateway.replace(/\/?$/, "/");
      const response = await fetch(`${gateway}${cidString}`);
      if (!response.ok) throw err;

      const block = new Uint8Array(await response.arrayBuffer());
      await this._helia!.blockstore.put(cid, block);
      return dagJson.decode(block) as IpfsContent;
    }
  }

  /**
   * Fetches content by its on-chain bytes32 digest by first reconstructing
   * the full CID, then delegating to fetch().
   */
  async fetchByBytes32(bytes32: string): Promise<IpfsContent> {
    const cidString = await this.bytes32ToCidString(bytes32);
    return this.fetch(cidString);
  }

  // ─── CID ↔ bytes32 helpers ──────────────────────────────────────────────────

  /**
   * Extracts the raw 32-byte SHA-256 digest from a dag-json CIDv1 and
   * returns it as a 0x-prefixed hex string.
   */
  cidToBytes32(cid: CID): string {
    // multihash digest is the raw hash bytes (32 bytes for sha2-256).
    const digest = cid.multihash.digest;
    return (
      "0x" +
      Array.from(digest)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    );
  }

  /**
   * Reconstructs a dag-json CIDv1 string from a bytes32 (0x-prefixed hex)
   * by wrapping the digest in a sha2-256 multihash.
   */
  async bytes32ToCidString(bytes32: string): Promise<string> {
    const [{ CID }, { sha256 }, { create: createMultihash }, { code: dagJsonCode }] =
      await Promise.all([
        import("multiformats/cid"),
        import("multiformats/hashes/sha2"),
        import("multiformats/hashes/digest"),
        // dag-json codec code is 0x0129
        import("@ipld/dag-json").then((m) => ({ code: m.code })),
      ]);

    const hex    = bytes32.startsWith("0x") ? bytes32.slice(2) : bytes32;
    const digest = Uint8Array.from(
      hex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
    );
    const multihash = createMultihash(sha256.code, digest);
    const cid       = CID.createV1(dagJsonCode, multihash);
    return cid.toString();
  }
}
