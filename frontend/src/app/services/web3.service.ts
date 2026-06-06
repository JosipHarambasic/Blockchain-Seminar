import { Injectable, signal, computed } from "@angular/core";
import { ethers } from "ethers";
import { environment } from "../../environments/environment";

declare let window: Window & { ethereum?: any };

@Injectable({ providedIn: "root" })
export class WalletService {
  readonly address     = signal<string | null>(null);
  readonly ensName     = signal<string | null>(null);
  readonly connecting  = signal(false);
  readonly displayName = computed(() => {
    const ens  = this.ensName();
    const addr = this.address();
    if (ens)  return ens;
    if (addr) return this.shortenAddress(addr);
    return null;
  });

  private _provider: ethers.BrowserProvider | null = null;
  private _signer:   ethers.JsonRpcSigner   | null = null;

  getSigner():   ethers.JsonRpcSigner    | null { return this._signer; }
  getProvider(): ethers.BrowserProvider  | null { return this._provider; }

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
      this._resolveEns(addr);

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

  disconnect(): void {
    this._signer   = null;
    this._provider = null;
    this.address.set(null);
    this.ensName.set(null);
  }

  private async _ensureCorrectNetwork(): Promise<void> {
    const network = await this._provider!.getNetwork();
    if (Number(network.chainId) === environment.networkChainId) return;
    try {
      await this._provider!.send("wallet_switchEthereumChain", [
        { chainId: "0x" + environment.networkChainId.toString(16) },
      ]);
    } catch (err: any) {
      if (err.code === 4902) {
        await this._provider!.send("wallet_addEthereumChain", [{
          chainId:        "0x" + environment.networkChainId.toString(16),
          chainName:       environment.networkName,
          rpcUrls:        [environment.rpcUrl],
          nativeCurrency: { name: "UZHETHs", symbol: "UZHETHs", decimals: 18 },
        }]);
      } else {
        throw err;
      }
    }
  }

  private async _resolveEns(address: string): Promise<void> {
    try {
      const name = await this._provider!.lookupAddress(address);
      this.ensName.set(name ?? null);
    } catch {
      this.ensName.set(null);
    }
  }

  async resolveAddress(nameOrAddress: string): Promise<string> {
    if (ethers.isAddress(nameOrAddress)) return nameOrAddress;
    try {
      const resolved = await this._provider?.resolveName(nameOrAddress);
      return resolved ?? nameOrAddress;
    } catch {
      return nameOrAddress;
    }
  }

  shortenAddress(address: string): string {
    return address.slice(0, 6) + "…" + address.slice(-4);
  }
}
