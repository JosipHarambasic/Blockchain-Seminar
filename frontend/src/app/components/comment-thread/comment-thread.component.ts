import {
  Component, Input, OnInit, signal, inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule }  from "@angular/forms";
import {
  IonCard, IonCardContent, IonButton, IonIcon, IonText, IonLabel,
  IonItem, IonTextarea, IonChip, IonSpinner,
  ToastController, LoadingController,
} from "@ionic/angular/standalone";
import { addIcons } from "ionicons";
import {
  heartOutline, heart, chatbubbleOutline, sendOutline,
  chevronDownOutline, chevronUpOutline,
} from "ionicons/icons";

import { WalletService }                     from "../../services/web3.service";
import { ForumService, CommentDisplay }      from "../../services/forum.service";

@Component({
  selector: "app-comment-thread",
  templateUrl: "comment-thread.component.html",
  styleUrls:  ["comment-thread.component.scss"],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonCard, IonCardContent, IonButton, IonIcon, IonText,
    IonItem, IonTextarea, IonSpinner,
  ],
})
/**
 * CommentThreadComponent
 *
 * Recursive standalone component that renders a single comment and, optionally,
 * its nested replies.  Depth 0 = direct child of a post; each level of nesting
 * increments depth by 1.  The Reply button is hidden at depth ≥ 4 to keep the
 * UI readable.  Replies at depth 0 are eagerly loaded on init (they are already
 * counted in the post's commentCount); deeper replies are loaded lazily when the
 * user expands the thread.
 */
export class CommentThreadComponent implements OnInit {
  // ── Inputs ───────────────────────────────────────────────────────────────
  @Input() comment!: CommentDisplay; // comment data resolved from IPFS + chain
  @Input() postId!:  number;         // needed when submitting a reply
  @Input() depth   = 0;             // current nesting level (0 = top-level)

  // ── DI ──────────────────────────────────────────────────────────────────
  readonly wallet    = inject(WalletService);
  private  forum     = inject(ForumService);
  private  toast     = inject(ToastController);
  private  loading   = inject(LoadingController);

  // ── State ────────────────────────────────────────────────────────────────
  replies          = signal<CommentDisplay[]>([]);
  showReplies      = signal(false);
  showReplyBox     = signal(false);
  replyText        = "";
  isSending        = signal(false); // true while IPFS upload + on-chain tx are in flight
  isLoadingReplies = signal(false);

  constructor() {
    addIcons({ heartOutline, heart, chatbubbleOutline, sendOutline, chevronDownOutline, chevronUpOutline });
  }

  ngOnInit(): void {
    if (this.depth === 0 && (this.comment.replyCount ?? 0) > 0) {
      this.loadReplies();
    }
  }

  get replyCount(): number {
    return this.comment.replyCount ?? 0;
  }

  async toggleReplies(): Promise<void> {
    if (this.showReplies()) {
      this.showReplies.set(false);
      return;
    }
    await this.loadReplies();
    this.showReplies.set(true);
  }

  private async loadReplies(): Promise<void> {
    if (this.isLoadingReplies()) return;
    this.isLoadingReplies.set(true);
    try {
      const r = await this.forum.getCommentReplies(this.comment.id);
      this.replies.set(r);
      this.showReplies.set(true);
    } catch (err: any) {
      await this._showToast(err?.message ?? "Failed to load replies", "danger");
    } finally {
      this.isLoadingReplies.set(false);
    }
  }

  async toggleLike(): Promise<void> {
    if (this.comment.liked || !this.wallet.address()) return;
    try {
      await this.forum.likeComment(this.comment.id);
      this.comment = { ...this.comment, liked: true, likeCount: this.comment.likeCount + 1 };
    } catch (err: any) {
      await this._showToast(err?.message ?? "Like failed", "danger");
    }
  }

  toggleReplyBox(): void {
    if (!this.wallet.address()) {
      this._showToast("Connect your wallet to reply", "warning");
      return;
    }
    this.showReplyBox.update((v) => !v);
  }

  async submitReply(): Promise<void> {
    if (!this.replyText.trim() || this.isSending()) return;
    this.isSending.set(true);
    const loader = await this.loading.create({ message: "Submitting reply…" });
    await loader.present();
    try {
      await this.forum.createComment(this.postId, this.comment.id, this.replyText.trim());
      this.replyText = "";
      this.showReplyBox.set(false);
      await this.loadReplies();
    } catch (err: any) {
      await this._showToast(err?.message ?? "Failed to submit reply", "danger");
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
