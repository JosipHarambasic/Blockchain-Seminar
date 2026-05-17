import { Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";
import { ethers } from "ethers";
import { environment } from "../../environments/environment";

declare let window: Window & { ethereum?: any };

@Injectable({ providedIn: "root" })
export class Web3Service {
  private provider: ethers.BrowserProvider | null = null;
  private signer: ethers.JsonRpcSigner | null = null;

  private accountSubject = new BehaviorSubject<string | null>(null);
  /** Observable that emits the currently connected account address (or null). */
  public account$ = this.accountSubject.asObservable();

  // ─── Connection ─────────────────────────────────────────────────────────

  /**
   * Requests MetaMask permission and connects to the first account.
   * Switches to the UZHETH PoS network if needed.
   * @returns The connected account address.
   */
  async connect(): Promise<string> {
    if (!window.ethereum) {
      throw new Error(
        "MetaMask not detected. Please install the MetaMask browser extension."
      );
    }

    this.provider = new ethers.BrowserProvider(window.ethereum);

    // Request account access
    await this.provider.send("eth_requestAccounts", []);

    // Ensure we are on the correct network
    await this.ensureCorrectNetwork();

    this.signer = await this.provider.getSigner();
    const address = await this.signer.getAddress();
    this.accountSubject.next(address);

    // React to account and chain changes
    window.ethereum.on("accountsChanged", async (accounts: string[]) => {
      if (accounts.length > 0) {
        this.signer = await this.provider!.getSigner();
        this.accountSubject.next(accounts[0]);
      } else {
        this.signer = null;
        this.accountSubject.next(null);
      }
    });

    window.ethereum.on("chainChanged", () => {
      // Reload so the provider/signer are re-initialised for the new chain
      window.location.reload();
    });

    return address;
  }

  // ─── Network switching ───────────────────────────────────────────────────

  private async ensureCorrectNetwork(): Promise<void> {
    const network = await this.provider!.getNetwork();
    if (Number(network.chainId) !== environment.networkChainId) {
      try {
        await this.provider!.send("wallet_switchEthereumChain", [
          { chainId: "0x" + environment.networkChainId.toString(16) },
        ]);
      } catch (switchError: any) {
        // Chain not yet added to MetaMask — add it
        if (switchError.code === 4902) {
          await this.provider!.send("wallet_addEthereumChain", [
            {
              chainId: "0x" + environment.networkChainId.toString(16),
              chainName: environment.networkName,
              rpcUrls: [environment.rpcUrl],
              nativeCurrency: { name: "UZHETHs", symbol: "UZHETHs", decimals: 18 },
            },
          ]);
        } else {
          throw switchError;
        }
      }
    }
  }

  // ─── Accessors ──────────────────────────────────────────────────────────

  getSigner(): ethers.JsonRpcSigner | null {
    return this.signer;
  }

  getProvider(): ethers.BrowserProvider | null {
    return this.provider;
  }

  isConnected(): boolean {
    return this.accountSubject.value !== null;
  }

  getCurrentAccount(): string | null {
    return this.accountSubject.value;
  }

  // ─── Utilities ──────────────────────────────────────────────────────────

  /** Returns a human-readable shortened address, e.g. 0x1234...abcd */
  shortenAddress(address: string): string {
    if (!address || address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  /** Formats a Unix timestamp (seconds) to a locale date-time string. */
  formatTimestamp(ts: number): string {
    return new Date(ts * 1000).toLocaleString();
  }
}
