// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title Forum
 * @notice Decentralised on-chain forum: posts, nested comments, and per-address likes.
 * @dev All data is stored on-chain. Each address may only like a given post or comment once.
 */
contract Forum {
    // ─── Data structures ──────────────────────────────────────────────────────

    struct Post {
        uint256 id;
        address author;
        string  title;
        string  body;
        uint256 timestamp;
        uint256 likeCount;
        uint256 commentCount;
    }

    struct Comment {
        uint256 id;
        uint256 postId;
        address author;
        string  body;
        uint256 timestamp;
        uint256 likeCount;
    }

    // ─── State variables ──────────────────────────────────────────────────────

    uint256 public postCount;
    uint256 public commentCount;

    mapping(uint256 => Post)      private _posts;
    mapping(uint256 => Comment)   private _comments;

    /// @dev Maps postId => ordered list of commentIds belonging to that post
    mapping(uint256 => uint256[]) private _postCommentIds;

    /// @dev Tracks whether a user has already liked a specific post
    mapping(address => mapping(uint256 => bool)) private _likedPost;

    /// @dev Tracks whether a user has already liked a specific comment
    mapping(address => mapping(uint256 => bool)) private _likedComment;

    // ─── Events ───────────────────────────────────────────────────────────────

    event PostCreated(
        uint256 indexed postId,
        address indexed author,
        string  title,
        uint256 timestamp
    );

    event CommentCreated(
        uint256 indexed commentId,
        uint256 indexed postId,
        address indexed author,
        uint256 timestamp
    );

    event PostLiked(
        uint256 indexed postId,
        address indexed liker,
        uint256 newLikeCount
    );

    event CommentLiked(
        uint256 indexed commentId,
        address indexed liker,
        uint256 newLikeCount
    );

    // ─── Write functions ──────────────────────────────────────────────────────

    /**
     * @notice Creates a new forum post.
     * @param _title Post title (1–200 characters).
     * @param _body  Post body  (1–5000 characters).
     * @return postId The ID of the newly created post.
     */
    function createPost(string calldata _title, string calldata _body)
        external
        returns (uint256 postId)
    {
        require(bytes(_title).length > 0 && bytes(_title).length <= 200,  "Title: 1-200 chars");
        require(bytes(_body).length  > 0 && bytes(_body).length  <= 5000, "Body: 1-5000 chars");

        postId = ++postCount;
        _posts[postId] = Post({
            id:           postId,
            author:       msg.sender,
            title:        _title,
            body:         _body,
            timestamp:    block.timestamp,
            likeCount:    0,
            commentCount: 0
        });

        emit PostCreated(postId, msg.sender, _title, block.timestamp);
    }

    /**
     * @notice Adds a comment to an existing post.
     * @param _postId The ID of the post to comment on.
     * @param _body   Comment body (1–2000 characters).
     * @return commentId The ID of the newly created comment.
     */
    function createComment(uint256 _postId, string calldata _body)
        external
        returns (uint256 commentId)
    {
        require(_postId > 0 && _postId <= postCount,                          "Post not found");
        require(bytes(_body).length > 0 && bytes(_body).length <= 2000, "Comment: 1-2000 chars");

        commentId = ++commentCount;
        _comments[commentId] = Comment({
            id:        commentId,
            postId:    _postId,
            author:    msg.sender,
            body:      _body,
            timestamp: block.timestamp,
            likeCount: 0
        });

        _postCommentIds[_postId].push(commentId);
        _posts[_postId].commentCount++;

        emit CommentCreated(commentId, _postId, msg.sender, block.timestamp);
    }

    /**
     * @notice Likes a post. Reverts if the caller has already liked it.
     * @param _postId The ID of the post to like.
     */
    function likePost(uint256 _postId) external {
        require(_postId > 0 && _postId <= postCount, "Post not found");
        require(!_likedPost[msg.sender][_postId],    "Already liked this post");

        _likedPost[msg.sender][_postId] = true;
        uint256 newCount = ++_posts[_postId].likeCount;

        emit PostLiked(_postId, msg.sender, newCount);
    }

    /**
     * @notice Likes a comment. Reverts if the caller has already liked it.
     * @param _commentId The ID of the comment to like.
     */
    function likeComment(uint256 _commentId) external {
        require(_commentId > 0 && _commentId <= commentCount, "Comment not found");
        require(!_likedComment[msg.sender][_commentId],        "Already liked this comment");

        _likedComment[msg.sender][_commentId] = true;
        uint256 newCount = ++_comments[_commentId].likeCount;

        emit CommentLiked(_commentId, msg.sender, newCount);
    }

    // ─── Read functions ───────────────────────────────────────────────────────

    /**
     * @notice Returns all posts in creation order.
     */
    function getAllPosts() external view returns (Post[] memory) {
        Post[] memory out = new Post[](postCount);
        for (uint256 i = 0; i < postCount; i++) {
            out[i] = _posts[i + 1];
        }
        return out;
    }

    /**
     * @notice Returns a single post by ID.
     */
    function getPost(uint256 _postId) external view returns (Post memory) {
        require(_postId > 0 && _postId <= postCount, "Post not found");
        return _posts[_postId];
    }

    /**
     * @notice Returns all comments belonging to a post, in creation order.
     */
    function getPostComments(uint256 _postId) external view returns (Comment[] memory) {
        require(_postId > 0 && _postId <= postCount, "Post not found");
        uint256[] storage ids = _postCommentIds[_postId];
        Comment[] memory out = new Comment[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            out[i] = _comments[ids[i]];
        }
        return out;
    }

    /**
     * @notice Returns whether `_user` has liked post `_postId`.
     */
    function hasLikedPost(address _user, uint256 _postId) external view returns (bool) {
        return _likedPost[_user][_postId];
    }

    /**
     * @notice Returns whether `_user` has liked comment `_commentId`.
     */
    function hasLikedComment(address _user, uint256 _commentId) external view returns (bool) {
        return _likedComment[_user][_commentId];
    }
}
