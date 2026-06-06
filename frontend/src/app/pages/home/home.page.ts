import {
  Component, OnInit, signal, computed, inject, effect,
} from "@angular/core";
import { CommonModule }  from "@angular/common";
import { Router }        from "@angular/router";
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
  IonFab, IonFabButton, IonRefresher, IonRefresherContent,
  IonSkeletonText, IonIcon, IonLabel, IonChip, IonText, IonInfiniteScroll,
  IonInfiniteScrollContent,
  ToastController, LoadingController,
} from "@ionic/angular/standalone";
import { addIcons } from "ionicons";
import {
  addOutline, heartOutline, heart, chatbubbleOutline,
  chevronForwardOutline, walletOutline, refreshOutline, logOutOutline,
} from "ionicons/icons";

import { WalletService }   from "../../services/web3.service";
import { ForumService, PostDisplay } from "../../services/forum.service";

const PAGE_SIZE = 10;

@Component({
  selector: "app-home",
  templateUrl: "home.page.html",
  styleUrls:  ["home.page.scss"],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
    IonFab, IonFabButton, IonRefresher, IonRefresherContent,
    IonSkeletonText, IonIcon, IonLabel, IonChip, IonText, IonInfiniteScroll,
    IonInfiniteScrollContent,
  ],
})
export class HomePage implements OnInit {
  // ── DI ──────────────────────────────────────────────────────────────────
  readonly wallet  = inject(WalletService);
  private  forum   = inject(ForumService);
  private  router  = inject(Router);
  private  toast   = inject(ToastController);
  private  loading = inject(LoadingController);

  // ── State ────────────────────────────────────────────────────────────────
  posts     = signal<PostDisplay[]>([]);
  total     = signal(0);
  isLoading = signal(false);
  hasMore   = computed(() => this.posts().length < this.total());

  // ── Skeletons for initial load ───────────────────────────────────────────
  readonly skeletons = Array(5);

  constructor() {
    addIcons({
      addOutline, heartOutline, heart, chatbubbleOutline,
      chevronForwardOutline, walletOutline, refreshOutline, logOutOutline,
    });

    // Re-evaluate liked state whenever the connected address changes
    // (connect, disconnect, or MetaMask account switch).
    effect(() => {
      const address = this.wallet.address(); // tracked
      if (address !== undefined) {
        this.loadPosts(true);
      }
    });
  }

  ngOnInit(): void {}

  // ─── Data loading ─────────────────────────────────────────────────────────

  async loadPosts(reset = false): Promise<void> {
    if (this.isLoading()) return;
    this.isLoading.set(true);
    try {
      const offset = reset ? 0 : this.posts().length;
      const { posts, total } = await this.forum.getPosts(offset, PAGE_SIZE);
      this.total.set(total);
      this.posts.update((existing) => reset ? posts : [...existing, ...posts]);
    } catch (err: any) {
      await this._showToast(err?.message ?? "Failed to load posts", "danger");
    } finally {
      this.isLoading.set(false);
    }
  }

  async handleRefresh(event: CustomEvent): Promise<void> {
    await this.loadPosts(true);
    (event.target as HTMLIonRefresherElement).complete();
  }

  async loadMore(event: CustomEvent): Promise<void> {
    await this.loadPosts(false);
    (event.target as HTMLIonInfiniteScrollElement).complete();
  }

  // ─── Navigation ───────────────────────────────────────────────────────────

  openPost(postId: number): void {
    this.router.navigate(["/post", postId]);
  }

  openCreatePost(): void {
    this.router.navigate(["/create"]);
  }

  // ─── Wallet ───────────────────────────────────────────────────────────────

  disconnectWallet(): void {
    this.wallet.disconnect();
  }

  async connectWallet(): Promise<void> {
    const loader = await this.loading.create({ message: "Connecting wallet…" });
    await loader.present();
    try {
      await this.wallet.connect();
      this.forum.connectSigner();
      await this.loadPosts(true);
    } catch (err: any) {
      await this._showToast(err?.message ?? "Wallet connection failed", "danger");
    } finally {
      await loader.dismiss();
    }
  }

  // ─── Likes ────────────────────────────────────────────────────────────────

  async toggleLike(post: PostDisplay, event: Event): Promise<void> {
    event.stopPropagation();
    if (!this.wallet.address()) {
      await this._showToast("Connect your wallet to like posts", "warning");
      return;
    }
    if (post.liked) return; // already liked — contract reverts on double-like
    try {
      await this.forum.likePost(post.id);
      // Optimistically update
      this.posts.update((all) =>
        all.map((p) =>
          p.id === post.id ? { ...p, liked: true, likeCount: p.likeCount + 1 } : p
        )
      );
    } catch (err: any) {
      await this._showToast(err?.message ?? "Like failed", "danger");
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async _showToast(message: string, color: string): Promise<void> {
    const t = await this.toast.create({ message, color, duration: 3000, position: "bottom" });
    await t.present();
  }
}
