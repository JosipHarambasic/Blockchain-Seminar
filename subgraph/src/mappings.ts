import {
  BigInt,
  Bytes,
} from "@graphprotocol/graph-ts";

import {
  PostCreated as PostCreatedEvent,
  CommentCreated as CommentCreatedEvent,
  PostLiked as PostLikedEvent,
  CommentLiked as CommentLikedEvent,
} from "../generated/Forum/Forum";

import {
  Post,
  Comment,
  User,
  PostLike,
  CommentLike,
} from "../generated/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Loads a User entity or creates it if this is the first interaction.
 * The ID is the lower-case hex address so queries are case-insensitive.
 */
function loadOrCreateUser(address: Bytes): User {
  const id = address.toHexString().toLowerCase();
  let user = User.load(id);
  if (!user) {
    user = new User(id);
    user.save();
  }
  return user;
}

// ─── Event handlers ───────────────────────────────────────────────────────────

export function handlePostCreated(event: PostCreatedEvent): void {
  const user = loadOrCreateUser(event.params.author);

  const post = new Post(event.params.postId.toString());
  post.postId       = event.params.postId;
  post.author       = user.id;
  post.contentHash  = event.params.contentHash;
  post.timestamp    = event.params.timestamp;
  post.likeCount    = BigInt.fromI32(0);
  post.commentCount = BigInt.fromI32(0);
  post.save();
}

export function handleCommentCreated(event: CommentCreatedEvent): void {
  const user = loadOrCreateUser(event.params.author);

  const comment = new Comment(event.params.commentId.toString());
  comment.commentId    = event.params.commentId;
  comment.post         = event.params.postId.toString();
  comment.author       = user.id;
  comment.contentHash  = event.params.contentHash;
  comment.timestamp    = event.params.timestamp;
  comment.likeCount    = BigInt.fromI32(0);

  // parentCommentId = 0 means top-level; only set the relation for real replies.
  const parentId = event.params.parentCommentId;
  if (parentId.gt(BigInt.fromI32(0))) {
    comment.parentComment = parentId.toString();
  } else {
    comment.parentComment = null;
  }
  comment.save();

  // Increment the post's commentCount.
  const post = Post.load(event.params.postId.toString());
  if (post) {
    post.commentCount = post.commentCount.plus(BigInt.fromI32(1));
    post.save();
  }
}

export function handlePostLiked(event: PostLikedEvent): void {
  // Update like count on the post entity.
  const post = Post.load(event.params.postId.toString());
  if (post) {
    post.likeCount = event.params.newLikeCount;
    post.save();
  }

  // Create a PostLike record for query-ability (who liked what).
  const likeId = event.params.postId.toString() + "-" + event.params.liker.toHexString();
  const like = new PostLike(likeId);
  like.post  = event.params.postId.toString();
  like.liker = event.params.liker;
  like.save();
}

export function handleCommentLiked(event: CommentLikedEvent): void {
  const comment = Comment.load(event.params.commentId.toString());
  if (comment) {
    comment.likeCount = event.params.newLikeCount;
    comment.save();
  }

  const likeId = event.params.commentId.toString() + "-" + event.params.liker.toHexString();
  const like = new CommentLike(likeId);
  like.comment = event.params.commentId.toString();
  like.liker   = event.params.liker;
  like.save();
}
