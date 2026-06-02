import {
  Component, signal, inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule }  from "@angular/forms";
import { Router }       from "@angular/router";
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonButton, IonIcon, IonItem, IonLabel, IonInput, IonTextarea, IonNote,
  IonSpinner,
  ToastController, LoadingController,
} from "@ionic/angular/standalone";
import { addIcons } from "ionicons";
import { sendOutline } from "ionicons/icons";

import { WalletService }  from "../../services/web3.service";
import { ForumService }   from "../../services/forum.service";

@Component({
  selector: "app-create-post",
  templateUrl: "create-post.page.html",
  styleUrls:  ["create-post.page.scss"],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
    IonButton, IonIcon, IonItem, IonLabel, IonInput, IonTextarea, IonNote,
    IonSpinner,
  ],
})
export class CreatePostPage {
  readonly wallet  = inject(WalletService);
  private  forum   = inject(ForumService);
  private  router  = inject(Router);
  private  toast   = inject(ToastController);
  private  loading = inject(LoadingController);

  title      = "";
  body       = "";
  isSending  = signal(false);

  constructor() {
    addIcons({ sendOutline });
  }

  get canSubmit(): boolean {
    return this.title.trim().length > 0 && this.body.trim().length > 0 && !this.isSending();
  }

  async connectWallet(): Promise<void> {
    const loader = await this.loading.create({ message: "Connecting wallet…" });
    await loader.present();
    try {
      await this.wallet.connect();
      this.forum.connectSigner();
    } catch (err: any) {
      await this._showToast(err?.message ?? "Connection failed", "danger");
    } finally {
      await loader.dismiss();
    }
  }

  async submit(): Promise<void> {
    if (!this.canSubmit) return;
    if (!this.wallet.address()) {
      await this._showToast("Connect your wallet first", "warning");
      return;
    }

    this.isSending.set(true);
    const loader = await this.loading.create({ message: "Uploading to IPFS…" });
    await loader.present();

    try {
      const postId = await this.forum.createPost(this.title.trim(), this.body.trim());
      await loader.dismiss();
      await this._showToast("Post published!", "success");
      await this.router.navigate(["/post", postId]);
    } catch (err: any) {
      await loader.dismiss();
      await this._showToast(err?.message ?? "Failed to create post", "danger");
    } finally {
      this.isSending.set(false);
    }
  }

  private async _showToast(message: string, color: string): Promise<void> {
    const t = await this.toast.create({ message, color, duration: 3000, position: "bottom" });
    await t.present();
  }
}
