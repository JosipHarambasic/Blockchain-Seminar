import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute } from "@angular/router";
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from "@angular/forms";
import { AlertController, LoadingController, ToastController } from "@ionic/angular/standalone";
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonChip,
  IonLabel, IonIcon, IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle,
  IonCardContent, IonRefresher, IonRefresherContent, IonSkeletonText,
  IonBackButton, IonItem, IonTextarea, IonNote, IonText,
} from "@ionic/angular/standalone";
import { addIcons } from "ionicons";
import {
  walletOutline, checkmarkCircleOutline, heartOutline, heart,
  personCircleOutline, chatbubblesOutline, chatbubbleEllipsesOutline,
  personOutline, createOutline, sendOutline,
} from "ionicons/icons";
import { Subscription } from "rxjs";

import { Web3Service } from "../../services/web3.service";
import { ForumService, PostDisplay, CommentDisplay } from "../../services/forum.service";

@Component({
  selector: "app-post-detail",
  templateUrl: "post-detail.page.html",
  styleUrls: ["post-detail.page.scss"],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonChip,
    IonLabel, IonIcon, IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle,
    IonCardContent, IonRefresher, IonRefresherContent, IonSkeletonText,
    IonBackButton, IonItem, IonTextarea, IonNote, IonText,
  ],
})
export class PostDetailPage implements OnInit, OnDestroy {
  post: PostDisplay | null = null;
  comments: CommentDisplay[] = [];
  account: string | null = null;
  accountShort: string | null = null;
  isLoadingPost = false;
  isLoadingComments = false;
  isSubmittingComment = false;

  commentForm: FormGroup;

  private postId!: number;
  private accountSub!: Subscription;

  constructor(
    private route: ActivatedRoute,
    private web3: Web3Service,
    private forum: ForumService,
    private fb: FormBuilder,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {
    addIcons({
      walletOutline, checkmarkCircleOutline, heartOutline, heart,
      personCircleOutline, chatbubblesOutline, chatbubbleEllipsesOutline,
      personOutline, createOutline, sendOutline,
    });
    this.commentForm = this.fb.group({
      body: ["", [Validators.required, Validators.maxLength(2000)]],
    });
  }

  ngOnInit(): void {
    this.postId = Number(this.route.snapshot.paramMap.get("id"));

    this.accountSub = this.web3.account$.subscribe((acc) => {
      this.account = acc;
      this.accountShort = acc ? this.web3.shortenAddress(acc) : null;
      // Re-fetch to update liked flags when the account changes
      this.loadData();
    });

    this.loadData();
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  // ─── Data loading ─────────────────────────────────────────────────────────

  async loadData(event?: any): Promise<void> {
    await Promise.all([this.loadPost(), this.loadComments()]);
    if (event) event.target.complete();
  }

  private async loadPost(): Promise<void> {
    this.isLoadingPost = true;
    try {
      this.post = await this.forum.getPost(this.postId);
    } catch (err: any) {
      await this.showAlert("Error loading post", err?.message ?? String(err));
    } finally {
      this.isLoadingPost = false;
    }
  }

  private async loadComments(): Promise<void> {
    this.isLoadingComments = true;
    try {
      this.comments = await this.forum.getPostComments(this.postId);
    } catch (err: any) {
      await this.showAlert("Error loading comments", err?.message ?? String(err));
    } finally {
      this.isLoadingComments = false;
    }
  }

  // ─── Wallet ───────────────────────────────────────────────────────────────

  async connectWallet(): Promise<void> {
    const loading = await this.loadingCtrl.create({ message: "Connecting wallet…" });
    await loading.present();
    try {
      await this.web3.connect();
      await this.showToast("Wallet connected!", "success");
    } catch (err: any) {
      await this.showAlert("Connection failed", err?.message ?? String(err));
    } finally {
      await loading.dismiss();
    }
  }

  // ─── Like post ────────────────────────────────────────────────────────────

  async likePost(): Promise<void> {
    if (!this.account) {
      await this.showAlert("Not connected", "Please connect your wallet to like posts.");
      return;
    }
    if (!this.post || this.post.liked) return;

    const loading = await this.loadingCtrl.create({ message: "Sending like…" });
    await loading.present();
    try {
      await this.forum.likePost(this.postId);
      this.post.likeCount++;
      this.post.liked = true;
      await this.showToast("Post liked!", "success");
    } catch (err: any) {
      await this.showAlert("Transaction failed", err?.message ?? String(err));
    } finally {
      await loading.dismiss();
    }
  }

  // ─── Like comment ─────────────────────────────────────────────────────────

  async likeComment(comment: CommentDisplay): Promise<void> {
    if (!this.account) {
      await this.showAlert("Not connected", "Please connect your wallet to like comments.");
      return;
    }
    if (comment.liked) return;

    const loading = await this.loadingCtrl.create({ message: "Sending like…" });
    await loading.present();
    try {
      await this.forum.likeComment(comment.id);
      comment.likeCount++;
      comment.liked = true;
      await this.showToast("Comment liked!", "success");
    } catch (err: any) {
      await this.showAlert("Transaction failed", err?.message ?? String(err));
    } finally {
      await loading.dismiss();
    }
  }

  // ─── Submit comment ───────────────────────────────────────────────────────

  async submitComment(): Promise<void> {
    if (!this.account) {
      await this.showAlert("Not connected", "Please connect your wallet to comment.");
      return;
    }
    if (this.commentForm.invalid) return;

    const { body } = this.commentForm.value;
    const loading = await this.loadingCtrl.create({ message: "Submitting comment to blockchain…" });
    await loading.present();

    try {
      await this.forum.createComment(this.postId, body.trim());
      this.commentForm.reset();
      await this.showToast("Comment posted!", "success");
      // Refresh both post (commentCount) and comments list
      await this.loadData();
    } catch (err: any) {
      await this.showAlert("Transaction failed", err?.message ?? String(err));
    } finally {
      await loading.dismiss();
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async showToast(message: string, color: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      color,
      duration: 2500,
      position: "bottom",
    });
    await toast.present();
  }

  private async showAlert(header: string, message: string): Promise<void> {
    const alert = await this.alertCtrl.create({ header, message, buttons: ["OK"] });
    await alert.present();
  }
}
