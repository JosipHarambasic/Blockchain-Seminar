/**
 * WalletService
 *
 * Wraps ethers.js v6 BrowserProvider (MetaMask) and exposes the connected
 * wallet state via Angular signals so components can react without needing
 * RxJS subscriptions.  ENS name resolution is attempted on every connect /
 * account change; a null ensName means the address has no reverse record.
 */
import { Injectable, signal, computed } from "@angular/core";
import { ethers } from "ethers";
import { environment } from "../../environments/environment";

declare let window: Window & { ethereum?: any };

@Injectable({ providedIn: "root" })
export class WalletService {
  // ─── Signals ────────────────────────────────────────────────────────────────

  /** Raw hex address of the connected account, or null if disconnected. */
  readonly address = signal<string | null>(null);

  /** ENS name for the connected address (e.g. "alice.eth"), or null. */
  readonly ensName = signal<string | null>(null);

  /** True while a connection request is in flight. */
  readonly connecting = signal(false);

  /** Derived: short display label — ENS name if available, else "0x1234…abcd". */
  readonly displayName = computed(() => {
    const ens = this.ensName();
    const addr = this.address();
    if (ens) return ens;
    if (addr) return this.shortenAddress(addr);
    return null;
  });

  // ─── Private state ───────────────────────────────────────────────────────────

  private _provider: ethers.BrowserProvider | null = null;
  private _signer:   ethers.JsonRpcSigner   | null = null;

  // ─── Public accessors ────────────────────────────────────────────────────────

  /** Returns the current ethers signer (or null if not connected). */
  getSigner(): ethers.JsonRpcSigner | null {
    return this._signer;
  }

  /** Returns the current BrowserProvider (or null). */
  getProvider(): ethers.BrowserProvider | null {
    return this._provider;
  }

  isConnected(): boolean {
    return this.address() !== null;
  }

  // ─── Connection ──────────────────────────────────────────────────────────────

  /**
   * Requests MetaMask permission, switches to the correct network, then
   * populates the signals.  Safe to call multiple times.
   */
  async connect(): Promise<string> {
    if (!window.ethereum) {
      throw new Error("MetaMask not detected. Please install the MetaMask browser extension.");
    }

    this.connecting.set(true);
    try {
      this._provider = new ethers.BrowserProvider(window.ethereum);

      await this._provider.send("eth_requestAccounts", []);
      await this._ensureCorrectNetwork();

      this._signer = await this._provider.getSigner();
      const addr   = await this._signer.getAddress();
      this.address.set(addr);

      // Attempt ENS reverse-lookup (only works on mainnet / testnets with ENS).
      this._resolveEns(addr);

      // React to account / chain changes.
      window.ethereum.on("accountsChanged", (accounts: string[]) => {
        if (accounts.length > 0) {
          this._provider!.getSigner().then((s) => {
            this._signer = s;
            this.address.set(accounts[0]);
            this._resolveEns(accounts[0]);
          });
        } else {
          this._signer = null;
          this.address.set(null);
          this.ensName.set(null);
        }
      });

      window.ethereum.on("chainChanged", () => window.location.reload());

      return addr;
    } finally {
      this.connecting.set(false);
    }
  }

  // ─── Network switching ────────────────────────────────────────────────────────

  private async _ensureCorrectNetwork(): Promise<void> {
    const network = await this._provider!.getNetwork();
    if (Number(network.chainId) === environment.networkChainId) return;

    try {
      await this._provider!.send("wallet_switchEthereumChain", [
        { chainId: "0x" + environment.networkChainId.toString(16) },
      ]);
    } catch (err: any) {
      // Error 4902 — chain not yet added to MetaMask; add it automatically.
      if (err.code === 4902) {
        await this._provider!.send("wallet_addEthereumChain", [
          {
            chainId:         "0x" + environment.networkChainId.toString(16),
            chainName:        environment.networkName,
            rpcUrls:         [environment.rpcUrl],
            nativeCurrency:  { name: "UZHETHs", symbol: "UZHETHs", decimals: 18 },
          },
        ]);
      } else {
        throw err;
      }
    }
  }

  // ─── ENS ─────────────────────────────────────────────────────────────────────

  /**
   * Attempts an ENS reverse lookup.  Never throws — silently clears ensName
   * if the lookup fails or returns null.
   */
  private async _resolveEns(address: string): Promise<void> {
    try {
      const name = await this._provider!.lookupAddress(address);
      this.ensName.set(name ?? null);
    } catch {
      this.ensName.set(null);
    }
  }

  /**
   * Resolves an ENS name to an address, or returns the input unchanged if it
   * is already an address or lookup fails.
   */
  async resolveAddress(nameOrAddress: string): Promise<string> {
    if (ethers.isAddress(nameOrAddress)) return nameOrAddress;
    try {
      const resolved = await this._provider?.resolveName(nameOrAddress);
      return resolved ?? nameOrAddress;
    } catch {
      return nameOrAddress;
    }
  }

  // ─── Utilities ───────────────────────────────────────────────────────────────

  shortenAddress(address: string): string {
    return address.slice(0, 6) + "…" + address.slice(-4);
  }
}
