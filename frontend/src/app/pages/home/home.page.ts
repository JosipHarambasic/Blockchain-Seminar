import {
  Component, OnInit, signal, computed, inject, effect,
} from "@angular/core";
import { CommonModule }  from "@angular/common";
import { Router }        from "@angular/router";
import {
  IonContent, IonButton,
  IonRefresher, IonRefresherContent,
  IonSkeletonText, IonIcon, IonInfiniteScroll,
  IonInfiniteScrollContent,
  ToastController, LoadingController,
} from "@ionic/angular/standalone";
import { addIcons } from "ionicons";
import {
  heartOutline, heart, chatbubbleOutline,
  homeOutline, documentTextOutline, bookmarkOutline, settingsOutline,
  addCircle, personOutline, menuOutline, closeOutline,
  happy, planet, leaf, moon, sunny, snow, thunderstorm,
  flame, diamond, musicalNotes, pizza, bicycle, boat, globe, star, rocket,
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
    IonContent, IonButton,
    IonRefresher, IonRefresherContent,
    IonSkeletonText, IonIcon, IonInfiniteScroll,
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
  posts          = signal<PostDisplay[]>([]);
  total          = signal(0);
  isLoading      = signal(false);
  isMyLoading    = signal(false);
  view           = signal<'all' | 'mine'>('all');
  myPosts        = signal<PostDisplay[]>([]);
  myPostsLoaded  = signal(false);
  hasMore        = computed(() => this.view() === 'all' && this.posts().length < this.total());
  visiblePosts   = computed(() => this.view() === 'mine' ? this.myPosts() : this.posts());
  sidebarOpen    = signal(false);

  // ── Skeletons for initial load ───────────────────────────────────────────
  readonly skeletons = Array(5);

  constructor() {
    addIcons({
      heartOutline, heart, chatbubbleOutline,
      homeOutline, documentTextOutline, bookmarkOutline, settingsOutline,
      addCircle, personOutline, menuOutline, closeOutline,
      happy, planet, leaf, moon, sunny, snow, thunderstorm,
      flame, diamond, musicalNotes, pizza, bicycle, boat, globe, star, rocket,
    });

    // Re-evaluate liked state whenever the connected address changes
    // (connect, disconnect, or MetaMask account switch).
    effect(() => {
      const address = this.wallet.address(); // tracked
      if (address !== undefined) {
        this.loadPosts(true);
        if (address && this.view() === 'mine') {
          this.myPostsLoaded.set(false);
          this.loadMyPosts();
        }
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
    if (this.view() === 'mine') {
      this.myPostsLoaded.set(false);
      this.myPosts.set([]);
      await this.loadMyPosts();
    } else {
      await this.loadPosts(true);
    }
    (event.target as HTMLIonRefresherElement).complete();
  }

  async loadMore(event: CustomEvent): Promise<void> {
    await this.loadPosts(false);
    (event.target as HTMLIonInfiniteScrollElement).complete();
  }

  async loadMyPosts(): Promise<void> {
    const addr = this.wallet.address();
    if (!addr) {
      await this._showToast("Connect your wallet to see your posts", "warning");
      return;
    }
    if (this.isMyLoading()) return;
    this.isMyLoading.set(true);
    try {
      const posts = await this.forum.getPostsByAuthor(addr);
      this.myPosts.set(posts);
      this.myPostsLoaded.set(true);
    } catch (err: any) {
      await this._showToast(err?.message ?? "Failed to load your posts", "danger");
    } finally {
      this.isMyLoading.set(false);
    }
  }

  // ─── Navigation ───────────────────────────────────────────────────────────

  openPost(postId: number): void {
    this.router.navigate(["/post", postId]);
  }

  openCreatePost(): void {
    this.router.navigate(["/create"]);
  }

  setView(v: 'all' | 'mine'): void {
    this.view.set(v);
    this.sidebarOpen.set(false);
    if (v === 'mine' && !this.myPostsLoaded()) this.loadMyPosts();
  }

  toggleSidebar(): void {
    this.sidebarOpen.update(o => !o);
  }

  // ─── Wallet ───────────────────────────────────────────────────────────────

  disconnectWallet(): void {
    this.wallet.disconnect();
    this.view.set('all');
    this.myPosts.set([]);
    this.myPostsLoaded.set(false);
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

  avatarColor(address: string): string {
    const palette = ['#6366f1','#ec4899','#14b8a6','#f59e0b','#ef4444','#8b5cf6','#3b82f6','#10b981'];
    const idx = parseInt(address.slice(-2), 16) % palette.length;
    return palette[idx];
  }

  avatarIcon(address: string): string {
    const icons = [
      'happy','planet','leaf','moon','sunny','snow','thunderstorm',
      'flame','diamond','musical-notes','pizza','bicycle','boat','globe','star','rocket',
    ];
    const idx = parseInt(address.slice(-4, -2), 16) % icons.length;
    return icons[idx];
  }
}
