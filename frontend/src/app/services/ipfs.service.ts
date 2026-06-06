import { Injectable } from "@angular/core";
import { environment } from "../../environments/environment";

import type { Helia } from "helia";
import type { CID }   from "multiformats/cid";

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
  private _helia:       Helia       | null = null;
  private _initPromise: Promise<void> | null = null;

  private async _init(): Promise<void> {
    if (this._helia) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      const [{ createHelia }, { IDBBlockstore }, { IDBDatastore }] = await Promise.all([
        import("helia"),
        import("blockstore-idb"),
        import("datastore-idb"),
      ]);

      const blockstore = new IDBBlockstore("forum-helia-blocks");
      const datastore  = new IDBDatastore("forum-helia-data");
      await blockstore.open();
      await datastore.open();

      this._helia = await createHelia({ blockstore, datastore, blockBrokers: [], start: false });
    })();

    return this._initPromise;
  }

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

  private async _pinPublicly(content: IpfsContent, cid: string, bytes32: string): Promise<void> {
    const endpoint = environment.ipfsPinningEndpoint;
    if (!endpoint) throw new Error("IPFS pinning endpoint is not configured");

    const response = await fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ...content, cid, bytes32 }),
    });

    let payload: Partial<PinningResponse> & { error?: string } = {};
    try { payload = await response.json(); } catch { /* non-JSON error body */ }

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
      const gateway  = environment.ipfsGateway.replace(/\/?$/, "/");
      const response = await fetch(`${gateway}${cidString}`);
      if (!response.ok) throw err;
      const block = new Uint8Array(await response.arrayBuffer());
      await this._helia!.blockstore.put(cid, block);
      return dagJson.decode(block) as IpfsContent;
    }
  }

  async fetchByBytes32(bytes32: string): Promise<IpfsContent> {
    const cidString = await this.bytes32ToCidString(bytes32);
    return this.fetch(cidString);
  }

  cidToBytes32(cid: CID): string {
    const digest = cid.multihash.digest;
    return "0x" + Array.from(digest).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async bytes32ToCidString(bytes32: string): Promise<string> {
    const [{ CID }, { sha256 }, { create: createMultihash }, { code: dagJsonCode }] =
      await Promise.all([
        import("multiformats/cid"),
        import("multiformats/hashes/sha2"),
        import("multiformats/hashes/digest"),
        import("@ipld/dag-json").then((m) => ({ code: m.code })),
      ]);
    const hex       = bytes32.startsWith("0x") ? bytes32.slice(2) : bytes32;
    const digest    = Uint8Array.from(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
    const multihash = createMultihash(sha256.code, digest);
    return CID.createV1(dagJsonCode, multihash).toString();
  }
}
