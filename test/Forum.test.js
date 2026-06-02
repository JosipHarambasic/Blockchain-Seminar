const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

// Helper: create a non-zero bytes32 from a plain string (simulates a real CID digest).
function toBytes32(str) {
  return ethers.encodeBytes32String(str.padEnd(31, "\0").slice(0, 31));
}

const HASH_A = toBytes32("post-a-cid");
const HASH_B = toBytes32("post-b-cid");
const HASH_C = toBytes32("comment-c-cid");
const HASH_D = toBytes32("reply-d-cid");

describe("Forum", function () {
  let forum;
  let owner, alice, bob, carol;

  beforeEach(async function () {
    [owner, alice, bob, carol] = await ethers.getSigners();
    const Forum = await ethers.getContractFactory("Forum");
    forum = await Forum.deploy();
  });

  // ─── createPost ────────────────────────────────────────────────────────────

  describe("createPost", function () {
    it("creates a post and increments postCount", async function () {
      await forum.connect(alice).createPost(HASH_A);
      expect(await forum.postCount()).to.equal(1n);
    });

    it("stores correct post data", async function () {
      await forum.connect(alice).createPost(HASH_A);
      const post = await forum.getPost(1n);
      expect(post.id).to.equal(1n);
      expect(post.contentHash).to.equal(HASH_A);
      expect(post.author).to.equal(alice.address);
      expect(post.likeCount).to.equal(0n);
      expect(post.commentCount).to.equal(0n);
    });

    it("emits PostCreated event", async function () {
      await expect(forum.connect(alice).createPost(HASH_A))
        .to.emit(forum, "PostCreated")
        .withArgs(1n, alice.address, HASH_A, anyValue);
    });

    it("reverts with zero contentHash", async function () {
      await expect(forum.createPost(ethers.ZeroHash)).to.be.revertedWith("contentHash required");
    });

    it("assigns sequential IDs to multiple posts", async function () {
      await forum.connect(alice).createPost(HASH_A);
      await forum.connect(bob).createPost(HASH_B);
      expect((await forum.getPost(1n)).id).to.equal(1n);
      expect((await forum.getPost(2n)).id).to.equal(2n);
    });
  });

  // ─── createComment ─────────────────────────────────────────────────────────

  describe("createComment", function () {
    beforeEach(async function () {
      await forum.connect(alice).createPost(HASH_A);
    });

    it("creates a top-level comment and increments commentCount on post", async function () {
      await forum.connect(bob).createComment(1n, 0n, HASH_C);
      expect(await forum.commentCount()).to.equal(1n);
      const post = await forum.getPost(1n);
      expect(post.commentCount).to.equal(1n);
    });

    it("stores correct comment data", async function () {
      await forum.connect(bob).createComment(1n, 0n, HASH_C);
      const comments = await forum.getPostComments(1n);
      expect(comments[0].contentHash).to.equal(HASH_C);
      expect(comments[0].author).to.equal(bob.address);
      expect(comments[0].postId).to.equal(1n);
      expect(comments[0].parentCommentId).to.equal(0n);
    });

    it("emits CommentCreated event", async function () {
      await expect(forum.connect(bob).createComment(1n, 0n, HASH_C))
        .to.emit(forum, "CommentCreated")
        .withArgs(1n, 1n, 0n, bob.address, HASH_C, anyValue);
    });

    it("reverts on non-existent post", async function () {
      await expect(forum.createComment(999n, 0n, HASH_C)).to.be.revertedWith("Post not found");
    });

    it("reverts with zero contentHash", async function () {
      await expect(forum.createComment(1n, 0n, ethers.ZeroHash)).to.be.revertedWith("contentHash required");
    });

    it("allows multiple comments on the same post", async function () {
      await forum.connect(bob).createComment(1n, 0n, HASH_C);
      await forum.connect(carol).createComment(1n, 0n, HASH_D);
      const comments = await forum.getPostComments(1n);
      expect(comments.length).to.equal(2);
    });

    it("creates a nested reply to an existing comment", async function () {
      await forum.connect(bob).createComment(1n, 0n, HASH_C);   // comment id=1
      await forum.connect(carol).createComment(1n, 1n, HASH_D); // reply to 1
      const replies = await forum.getCommentReplies(1n);
      expect(replies.length).to.equal(1);
      expect(replies[0].parentCommentId).to.equal(1n);
      expect(replies[0].author).to.equal(carol.address);
    });

    it("reply does not appear in top-level getPostComments", async function () {
      await forum.connect(bob).createComment(1n, 0n, HASH_C);
      await forum.connect(carol).createComment(1n, 1n, HASH_D);
      const topLevel = await forum.getPostComments(1n);
      expect(topLevel.length).to.equal(1);
    });

    it("reverts when parent comment belongs to a different post", async function () {
      await forum.connect(alice).createPost(HASH_B); // post id=2
      await forum.connect(bob).createComment(1n, 0n, HASH_C); // comment on post 1, id=1
      await expect(forum.connect(carol).createComment(2n, 1n, HASH_D))
        .to.be.revertedWith("Parent/post mismatch");
    });

    it("reverts when parentCommentId does not exist", async function () {
      await expect(forum.createComment(1n, 999n, HASH_C))
        .to.be.revertedWith("Parent comment not found");
    });
  });

  // ─── likePost ──────────────────────────────────────────────────────────────

  describe("likePost", function () {
    beforeEach(async function () {
      await forum.connect(alice).createPost(HASH_A);
    });

    it("increments post like count", async function () {
      await forum.connect(bob).likePost(1n);
      const post = await forum.getPost(1n);
      expect(post.likeCount).to.equal(1n);
    });

    it("emits PostLiked event", async function () {
      await expect(forum.connect(bob).likePost(1n))
        .to.emit(forum, "PostLiked")
        .withArgs(1n, bob.address, 1n);
    });

    it("reverts when liking the same post twice", async function () {
      await forum.connect(bob).likePost(1n);
      await expect(forum.connect(bob).likePost(1n)).to.be.revertedWith("Already liked this post");
    });

    it("allows different users to like the same post", async function () {
      await forum.connect(alice).likePost(1n);
      await forum.connect(bob).likePost(1n);
      await forum.connect(carol).likePost(1n);
      const post = await forum.getPost(1n);
      expect(post.likeCount).to.equal(3n);
    });

    it("reverts on non-existent post", async function () {
      await expect(forum.likePost(999n)).to.be.revertedWith("Post not found");
    });

    it("correctly reports hasLikedPost", async function () {
      expect(await forum.hasLikedPost(bob.address, 1n)).to.be.false;
      await forum.connect(bob).likePost(1n);
      expect(await forum.hasLikedPost(bob.address, 1n)).to.be.true;
      expect(await forum.hasLikedPost(carol.address, 1n)).to.be.false;
    });
  });

  // ─── likeComment ───────────────────────────────────────────────────────────

  describe("likeComment", function () {
    beforeEach(async function () {
      await forum.connect(alice).createPost(HASH_A);
      await forum.connect(bob).createComment(1n, 0n, HASH_C);
    });

    it("increments comment like count", async function () {
      await forum.connect(alice).likeComment(1n);
      const comments = await forum.getPostComments(1n);
      expect(comments[0].likeCount).to.equal(1n);
    });

    it("emits CommentLiked event", async function () {
      await expect(forum.connect(alice).likeComment(1n))
        .to.emit(forum, "CommentLiked")
        .withArgs(1n, alice.address, 1n);
    });

    it("reverts when liking the same comment twice", async function () {
      await forum.connect(alice).likeComment(1n);
      await expect(forum.connect(alice).likeComment(1n)).to.be.revertedWith("Already liked this comment");
    });

    it("correctly reports hasLikedComment", async function () {
      expect(await forum.hasLikedComment(alice.address, 1n)).to.be.false;
      await forum.connect(alice).likeComment(1n);
      expect(await forum.hasLikedComment(alice.address, 1n)).to.be.true;
    });
  });

  // ─── getPosts (paginated) ──────────────────────────────────────────────────

  describe("getPosts", function () {
    it("returns empty array and total=0 when no posts", async function () {
      const [posts, total] = await forum.getPosts(0n, 10n);
      expect(posts.length).to.equal(0);
      expect(total).to.equal(0n);
    });

    it("returns posts newest-first", async function () {
      await forum.connect(alice).createPost(HASH_A); // id=1
      await forum.connect(bob).createPost(HASH_B);   // id=2
      const [posts] = await forum.getPosts(0n, 10n);
      expect(posts.length).to.equal(2);
      expect(posts[0].id).to.equal(2n); // newest first
      expect(posts[1].id).to.equal(1n);
    });

    it("paginates correctly with offset", async function () {
      await forum.connect(alice).createPost(HASH_A);
      await forum.connect(bob).createPost(HASH_B);
      await forum.connect(carol).createPost(toBytes32("c"));
      const [page1, total] = await forum.getPosts(0n, 2n);
      expect(page1.length).to.equal(2);
      expect(total).to.equal(3n);
      const [page2] = await forum.getPosts(2n, 2n);
      expect(page2.length).to.equal(1);
    });

    it("returns empty when offset >= total", async function () {
      await forum.connect(alice).createPost(HASH_A);
      const [posts] = await forum.getPosts(5n, 10n);
      expect(posts.length).to.equal(0);
    });
  });
});


describe("Forum", function () {
  let forum;
  let owner, alice, bob, carol;

  beforeEach(async function () {
    [owner, alice, bob, carol] = await ethers.getSigners();
    const Forum = await ethers.getContractFactory("Forum");
    forum = await Forum.deploy();
  });

  // ─── createPost ────────────────────────────────────────────────────────────

  describe("createPost", function () {
    it("creates a post and increments postCount", async function () {
      await forum.connect(alice).createPost("Hello World", "This is the body.");
      expect(await forum.postCount()).to.equal(1n);
    });

    it("stores correct post data", async function () {
      await forum.connect(alice).createPost("My Title", "My Body");
      const post = await forum.getPost(1n);
      expect(post.id).to.equal(1n);
      expect(post.title).to.equal("My Title");
      expect(post.body).to.equal("My Body");
      expect(post.author).to.equal(alice.address);
      expect(post.likeCount).to.equal(0n);
      expect(post.commentCount).to.equal(0n);
    });

    it("emits PostCreated event", async function () {
      await expect(forum.connect(alice).createPost("Title", "Body"))
        .to.emit(forum, "PostCreated")
        .withArgs(1n, alice.address, "Title", anyValue);
    });

    it("reverts with empty title", async function () {
      await expect(forum.createPost("", "Body")).to.be.revertedWith("Title: 1-200 chars");
    });

    it("reverts with title exceeding 200 chars", async function () {
      const longTitle = "a".repeat(201);
      await expect(forum.createPost(longTitle, "Body")).to.be.revertedWith("Title: 1-200 chars");
    });

    it("reverts with empty body", async function () {
      await expect(forum.createPost("Title", "")).to.be.revertedWith("Body: 1-5000 chars");
    });

    it("reverts with body exceeding 5000 chars", async function () {
      const longBody = "a".repeat(5001);
      await expect(forum.createPost("Title", longBody)).to.be.revertedWith("Body: 1-5000 chars");
    });

    it("assigns sequential IDs to multiple posts", async function () {
      await forum.connect(alice).createPost("Post 1", "Body 1");
      await forum.connect(bob).createPost("Post 2", "Body 2");
      expect((await forum.getPost(1n)).id).to.equal(1n);
      expect((await forum.getPost(2n)).id).to.equal(2n);
    });
  });

  // ─── createComment ─────────────────────────────────────────────────────────

  describe("createComment", function () {
    beforeEach(async function () {
      await forum.connect(alice).createPost("Post 1", "Body 1");
    });

    it("creates a comment and increments commentCount on post", async function () {
      await forum.connect(bob).createComment(1n, "Great post!");
      expect(await forum.commentCount()).to.equal(1n);
      const post = await forum.getPost(1n);
      expect(post.commentCount).to.equal(1n);
    });

    it("stores correct comment data", async function () {
      await forum.connect(bob).createComment(1n, "Nice!");
      const comments = await forum.getPostComments(1n);
      expect(comments[0].body).to.equal("Nice!");
      expect(comments[0].author).to.equal(bob.address);
      expect(comments[0].postId).to.equal(1n);
    });

    it("emits CommentCreated event", async function () {
      await expect(forum.connect(bob).createComment(1n, "Nice!"))
        .to.emit(forum, "CommentCreated")
        .withArgs(1n, 1n, bob.address, anyValue);
    });

    it("reverts on non-existent post", async function () {
      await expect(forum.createComment(999n, "Comment")).to.be.revertedWith("Post not found");
    });

    it("reverts with empty comment body", async function () {
      await expect(forum.createComment(1n, "")).to.be.revertedWith("Comment: 1-2000 chars");
    });

    it("reverts with comment body exceeding 2000 chars", async function () {
      const longBody = "a".repeat(2001);
      await expect(forum.createComment(1n, longBody)).to.be.revertedWith("Comment: 1-2000 chars");
    });

    it("allows multiple comments on the same post", async function () {
      await forum.connect(bob).createComment(1n, "First comment");
      await forum.connect(carol).createComment(1n, "Second comment");
      const comments = await forum.getPostComments(1n);
      expect(comments.length).to.equal(2);
    });
  });

  // ─── likePost ──────────────────────────────────────────────────────────────

  describe("likePost", function () {
    beforeEach(async function () {
      await forum.connect(alice).createPost("Post 1", "Body 1");
    });

    it("increments post like count", async function () {
      await forum.connect(bob).likePost(1n);
      const post = await forum.getPost(1n);
      expect(post.likeCount).to.equal(1n);
    });

    it("emits PostLiked event", async function () {
      await expect(forum.connect(bob).likePost(1n))
        .to.emit(forum, "PostLiked")
        .withArgs(1n, bob.address, 1n);
    });

    it("reverts when liking the same post twice", async function () {
      await forum.connect(bob).likePost(1n);
      await expect(forum.connect(bob).likePost(1n)).to.be.revertedWith("Already liked this post");
    });

    it("allows different users to like the same post", async function () {
      await forum.connect(alice).likePost(1n);
      await forum.connect(bob).likePost(1n);
      await forum.connect(carol).likePost(1n);
      const post = await forum.getPost(1n);
      expect(post.likeCount).to.equal(3n);
    });

    it("reverts on non-existent post", async function () {
      await expect(forum.likePost(999n)).to.be.revertedWith("Post not found");
    });

    it("correctly reports hasLikedPost", async function () {
      expect(await forum.hasLikedPost(bob.address, 1n)).to.be.false;
      await forum.connect(bob).likePost(1n);
      expect(await forum.hasLikedPost(bob.address, 1n)).to.be.true;
      expect(await forum.hasLikedPost(carol.address, 1n)).to.be.false;
    });
  });

  // ─── likeComment ───────────────────────────────────────────────────────────

  describe("likeComment", function () {
    beforeEach(async function () {
      await forum.connect(alice).createPost("Post 1", "Body 1");
      await forum.connect(bob).createComment(1n, "Comment 1");
    });

    it("increments comment like count", async function () {
      await forum.connect(alice).likeComment(1n);
      const comments = await forum.getPostComments(1n);
      expect(comments[0].likeCount).to.equal(1n);
    });

    it("emits CommentLiked event", async function () {
      await expect(forum.connect(alice).likeComment(1n))
        .to.emit(forum, "CommentLiked")
        .withArgs(1n, alice.address, 1n);
    });

    it("reverts when liking the same comment twice", async function () {
      await forum.connect(alice).likeComment(1n);
      await expect(forum.connect(alice).likeComment(1n)).to.be.revertedWith("Already liked this comment");
    });

    it("correctly reports hasLikedComment", async function () {
      expect(await forum.hasLikedComment(alice.address, 1n)).to.be.false;
      await forum.connect(alice).likeComment(1n);
      expect(await forum.hasLikedComment(alice.address, 1n)).to.be.true;
    });
  });

  // ─── getAllPosts ────────────────────────────────────────────────────────────

  describe("getAllPosts", function () {
    it("returns empty array when no posts", async function () {
      const posts = await forum.getAllPosts();
      expect(posts.length).to.equal(0);
    });

    it("returns all posts in order", async function () {
      await forum.connect(alice).createPost("Post A", "Body A");
      await forum.connect(bob).createPost("Post B", "Body B");
      await forum.connect(carol).createPost("Post C", "Body C");
      const posts = await forum.getAllPosts();
      expect(posts.length).to.equal(3);
      expect(posts[0].title).to.equal("Post A");
      expect(posts[1].title).to.equal("Post B");
      expect(posts[2].title).to.equal("Post C");
    });
  });
});
