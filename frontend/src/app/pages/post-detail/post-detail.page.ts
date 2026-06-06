import {
  Component, OnInit, signal, inject,
} from "@angular/core";
import { CommonModule }            from "@angular/common";
import { ActivatedRoute, Router }  from "@angular/router";
import { FormsModule }             from "@angular/forms";
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
  IonButton, IonIcon, IonText, IonLabel, IonTextarea, IonItem, IonChip,
  IonSkeletonText, IonSpinner,
  ToastController, LoadingController,
} from "@ionic/angular/standalone";
import { addIcons } from "ionicons";
import {
  heartOutline, heart, chatbubbleOutline, sendOutline, arrowBackOutline,
} from "ionicons/icons";

import { WalletService }                         from "../../services/web3.service";
import { ForumService, PostDisplay, CommentDisplay } from "../../services/forum.service";
import { CommentThreadComponent }                from "../../components/comment-thread/comment-thread.component";

@Component({
  selector: "app-post-detail",
  templateUrl: "post-detail.page.html",
  styleUrls:  ["post-detail.page.scss"],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
    IonButton, IonIcon, IonText, IonLabel, IonTextarea, IonItem, IonChip,
    IonSkeletonText, IonSpinner,
    CommentThreadComponent,
  ],
})
export class PostDetailPage implements OnInit {
  readonly wallet  = inject(WalletService);
  private  forum   = inject(ForumService);
  private  route   = inject(ActivatedRoute);
  private  router  = inject(Router);
  private  toast   = inject(ToastController);
  private  loading = inject(LoadingController);

  post       = signal<PostDisplay | null>(null);
  comments   = signal<CommentDisplay[]>([]);
  isLoading  = signal(false);
  isSending  = signal(false);
  newComment = "";

  postId!: number;

  constructor() {
    addIcons({ heartOutline, heart, chatbubbleOutline, sendOutline, arrowBackOutline });
  }

  ngOnInit(): void {
    this.postId = Number(this.route.snapshot.paramMap.get("id"));
    this.loadPost();
  }

  async loadPost(): Promise<void> {
    if (this.isLoading()) return;
    this.isLoading.set(true);
    try {
      const [post, comments] = await Promise.all([
        this.forum.getPost(this.postId),
        this.forum.getPostComments(this.postId),
      ]);
      this.post.set(post);
      this.comments.set(comments.filter((c) => c.parentCommentId === 0));
    } catch (err: any) {
      await this._showToast(err?.message ?? "Failed to load post", "danger");
      this.router.navigate(["/"]);
    } finally {
      this.isLoading.set(false);
    }
  }

  async connectWallet(): Promise<void> {
    const loader = await this.loading.create({ message: "Connecting wallet…" });
    await loader.present();
    try {
      await this.wallet.connect();
      this.forum.connectSigner();
      await this.loadPost();
    } catch (err: any) {
      await this._showToast(err?.message ?? "Connection failed", "danger");
    } finally {
      await loader.dismiss();
    }
  }

  async toggleLikePost(): Promise<void> {
    const p = this.post();
    if (!p || p.liked || !this.wallet.address()) return;
    try {
      await this.forum.likePost(p.id);
      this.post.update((cur) => cur ? { ...cur, liked: true, likeCount: cur.likeCount + 1 } : cur);
    } catch (err: any) {
      await this._showToast(err?.message ?? "Like failed", "danger");
    }
  }

  async submitComment(): Promise<void> {
    if (!this.newComment.trim() || this.isSending()) return;
    if (!this.wallet.address()) {
      await this._showToast("Connect your wallet to comment", "warning");
      return;
    }
    this.isSending.set(true);
    const loader = await this.loading.create({ message: "Submitting comment…" });
    await loader.present();
    try {
      await this.forum.createComment(this.postId, 0, this.newComment.trim());
      this.newComment = "";
      await this.loadPost();
    } catch (err: any) {
      await this._showToast(err?.message ?? "Failed to submit comment", "danger");
    } finally {
      this.isSending.set(false);
      await loader.dismiss();
    }
  }

  private async _showToast(message: string, color: string): Promise<void> {
    const t = await this.toast.create({ message, color, duration: 3000, position: "bottom" });
    await t.present();
  }
}
