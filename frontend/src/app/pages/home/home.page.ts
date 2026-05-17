import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { AlertController, LoadingController, ToastController } from "@ionic/angular/standalone";
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonChip,
  IonLabel, IonIcon, IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle,
  IonCardContent, IonFab, IonFabButton, IonRefresher, IonRefresherContent,
  IonSkeletonText, IonModal, IonItem, IonInput, IonTextarea, IonNote, IonText,
} from "@ionic/angular/standalone";
import { addIcons } from "ionicons";
import {
  chatbubblesOutline, walletOutline, checkmarkCircleOutline, heartOutline,
  heart, chatbubbleOutline, chevronForwardOutline, add, sendOutline, close,
} from "ionicons/icons";
import { Subscription } from "rxjs";

import { Web3Service } from "../../services/web3.service";
import { ForumService, PostDisplay } from "../../services/forum.service";

@Component({
  selector: "app-home",
  templateUrl: "home.page.html",
  styleUrls: ["home.page.scss"],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonChip,
    IonLabel, IonIcon, IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle,
    IonCardContent, IonFab, IonFabButton, IonRefresher, IonRefresherContent,
    IonSkeletonText, IonModal, IonItem, IonInput, IonTextarea, IonNote, IonText,
  ],
})
export class HomePage implements OnInit, OnDestroy {
  posts: PostDisplay[] = [];
  account: string | null = null;
  accountShort: string | null = null;
  isLoading = false;
  showCreateModal = false;

  createPostForm: FormGroup;

  private accountSub!: Subscription;

  constructor(
    private web3: Web3Service,
    private forum: ForumService,
    private router: Router,
    private fb: FormBuilder,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {
    addIcons({
      chatbubblesOutline, walletOutline, checkmarkCircleOutline, heartOutline,
      heart, chatbubbleOutline, chevronForwardOutline, add, sendOutline, close,
    });
    this.createPostForm = this.fb.group({
      title: ["", [Validators.required, Validators.maxLength(200)]],
      body: ["", [Validators.required, Validators.maxLength(5000)]],
    });
  }

  ngOnInit(): void {
    this.accountSub = this.web3.account$.subscribe((acc) => {
      this.account = acc;
      this.accountShort = acc ? this.web3.shortenAddress(acc) : null;
      // Reload posts to update like status when account changes
      this.loadPosts();
    });
    this.loadPosts();
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  // ─── Wallet ──────────────────────────────────────────────────────────────

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

  // ─── Posts ───────────────────────────────────────────────────────────────

  async loadPosts(event?: any): Promise<void> {
    this.isLoading = true;
    try {
      this.posts = await this.forum.getAllPosts();
    } catch (err: any) {
      await this.showAlert("Error loading posts", err?.message ?? String(err));
    } finally {
      this.isLoading = false;
      if (event) event.target.complete();
    }
  }

  openPost(postId: number): void {
    this.router.navigate(["/post", postId]);
  }

  // ─── Create post modal ───────────────────────────────────────────────────

  openCreateModal(): void {
    if (!this.account) {
      this.showAlert("Not connected", "Please connect your wallet before posting.");
      return;
    }
    this.createPostForm.reset();
    this.showCreateModal = true;
  }

  closeCreateModal(): void {
    this.showCreateModal = false;
  }

  async submitPost(): Promise<void> {
    if (this.createPostForm.invalid) return;

    const { title, body } = this.createPostForm.value;
    const loading = await this.loadingCtrl.create({ message: "Submitting post to blockchain…" });
    await loading.present();

    try {
      await this.forum.createPost(title.trim(), body.trim());
      this.showCreateModal = false;
      await this.showToast("Post created successfully!", "success");
      await this.loadPosts();
    } catch (err: any) {
      await this.showAlert("Transaction failed", err?.message ?? String(err));
    } finally {
      await loading.dismiss();
    }
  }

  // ─── Like ────────────────────────────────────────────────────────────────

  async likePost(event: Event, post: PostDisplay): Promise<void> {
    event.stopPropagation();

    if (!this.account) {
      await this.showAlert("Not connected", "Please connect your wallet to like posts.");
      return;
    }
    if (post.liked) return;

    const loading = await this.loadingCtrl.create({ message: "Sending like…" });
    await loading.present();

    try {
      await this.forum.likePost(post.id);
      post.likeCount++;
      post.liked = true;
      await this.showToast("Liked!", "success");
    } catch (err: any) {
      await this.showAlert("Transaction failed", err?.message ?? String(err));
    } finally {
      await loading.dismiss();
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async showToast(message: string, color: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      color,
      duration: 2000,
      position: "bottom",
    });
    await toast.present();
  }

  private async showAlert(header: string, message: string): Promise<void> {
    const alert = await this.alertCtrl.create({ header, message, buttons: ["OK"] });
    await alert.present();
  }
}
