// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title Forum
 * @notice Decentralised forum: posts and nested comments with IPFS content hashes.
 * @dev Content (title + body JSON) is stored on IPFS; only the 32-byte SHA-256
 *      digest of the CID is stored on-chain as bytes32. This keeps gas costs low
 *      while ensuring content integrity. Each address may only like a given post
 *      or comment once.
 */
contract Forum {
    // ─── Data structures ──────────────────────────────────────────────────────

    struct Post {
        uint256 id;
        address author;
        /// @dev Raw SHA-256 digest of the IPFS CIDv1 (dag-json codec).
        bytes32 contentHash;
        uint256 timestamp;
        uint256 likeCount;
        uint256 commentCount;
    }

    struct Comment {
        uint256 id;
        uint256 postId;
        /// @dev 0 means a top-level comment; >0 is the id of the parent comment.
        uint256 parentCommentId;
        address author;
        bytes32 contentHash;
        uint256 timestamp;
        uint256 likeCount;
    }

    // ─── State variables ──────────────────────────────────────────────────────

    uint256 public postCount;
    uint256 public commentCount;

    mapping(uint256 => Post)      private _posts;
    mapping(uint256 => Comment)   private _comments;

    /// @dev Maps postId => ordered list of top-level commentIds for that post.
    mapping(uint256 => uint256[]) private _postCommentIds;

    /// @dev Maps parentCommentId => ordered list of reply commentIds.
    mapping(uint256 => uint256[]) private _commentReplyIds;

    /// @dev Maps author address => ordered list of postIds created by that author.
    mapping(address => uint256[]) private _authorPostIds;

    /// @dev Tracks whether a user has already liked a specific post.
    mapping(address => mapping(uint256 => bool)) private _likedPost;

    /// @dev Tracks whether a user has already liked a specific comment.
    mapping(address => mapping(uint256 => bool)) private _likedComment;

    // ─── Events ───────────────────────────────────────────────────────────────

    event PostCreated(
        uint256 indexed postId,
        address indexed author,
        bytes32         contentHash,
        uint256         timestamp
    );

    // Only 3 indexed fields allowed per event in Solidity; postId and
    // parentCommentId are the most useful for subgraph filtering.
    event CommentCreated(
        uint256 indexed commentId,
        uint256 indexed postId,
        uint256         parentCommentId,
        address         author,
        bytes32         contentHash,
        uint256         timestamp
    );

    event PostLiked(
        uint256 indexed postId,
        address indexed liker,
        uint256         newLikeCount
    );

    event CommentLiked(
        uint256 indexed commentId,
        address indexed liker,
        uint256         newLikeCount
    );

    // ─── Write functions ──────────────────────────────────────────────────────

    /**
     * @notice Creates a new forum post.
     * @param _contentHash Raw SHA-256 digest of the IPFS CID for this post's JSON.
     * @return postId The ID of the newly created post.
     */
    function createPost(bytes32 _contentHash)
        external
        returns (uint256 postId)
    {
        require(_contentHash != bytes32(0), "contentHash required");

        postId = ++postCount;
        _posts[postId] = Post({
            id:           postId,
            author:       msg.sender,
            contentHash:  _contentHash,
            timestamp:    block.timestamp,
            likeCount:    0,
            commentCount: 0
        });

        _authorPostIds[msg.sender].push(postId);

        emit PostCreated(postId, msg.sender, _contentHash, block.timestamp);
    }

    /**
     * @notice Adds a comment to an existing post (top-level or reply).
     * @param _postId           The ID of the post to comment on.
     * @param _parentCommentId  0 for top-level; set to parent comment's ID for a reply.
     * @param _contentHash      Raw SHA-256 digest of the IPFS CID for this comment's JSON.
     * @return commentId The ID of the newly created comment.
     */
    function createComment(
        uint256 _postId,
        uint256 _parentCommentId,
        bytes32 _contentHash
    )
        external
        returns (uint256 commentId)
    {
        require(_postId > 0 && _postId <= postCount,      "Post not found");
        require(_contentHash != bytes32(0),                "contentHash required");
        // If a parent is given it must exist and belong to the same post.
        if (_parentCommentId != 0) {
            require(_parentCommentId <= commentCount, "Parent comment not found");
            require(_comments[_parentCommentId].postId == _postId, "Parent/post mismatch");
        }

        commentId = ++commentCount;
        _comments[commentId] = Comment({
            id:              commentId,
            postId:          _postId,
            parentCommentId: _parentCommentId,
            author:          msg.sender,
            contentHash:     _contentHash,
            timestamp:       block.timestamp,
            likeCount:       0
        });

        if (_parentCommentId == 0) {
            // Top-level comment — attach directly to the post.
            _postCommentIds[_postId].push(commentId);
            _posts[_postId].commentCount++;
        } else {
            // Reply — attach to the parent comment.
            _commentReplyIds[_parentCommentId].push(commentId);
        }

        emit CommentCreated(commentId, _postId, _parentCommentId, msg.sender, _contentHash, block.timestamp);
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
     * @notice Returns a paginated slice of posts, newest-first.
     * @param _offset Number of posts to skip (0-based).
     * @param _limit  Maximum number of posts to return (capped at 100).
     */
    function getPosts(uint256 _offset, uint256 _limit)
        external
        view
        returns (Post[] memory posts, uint256 total)
    {
        total = postCount;
        if (_offset >= total) {
            return (new Post[](0), total);
        }
        // Iterate from newest (postCount) down; _offset skips that many.
        uint256 available = total - _offset;
        uint256 count = available < _limit ? available : _limit;
        if (count > 100) count = 100; // hard cap to prevent excessive gas
        posts = new Post[](count);
        for (uint256 i = 0; i < count; i++) {
            // newest-first: postCount - _offset - i
            posts[i] = _posts[total - _offset - i];
        }
    }

    /**
     * @notice Returns a single post by ID.
     */
    function getPost(uint256 _postId) external view returns (Post memory) {
        require(_postId > 0 && _postId <= postCount, "Post not found");
        return _posts[_postId];
    }

    /**
     * @notice Returns all top-level comments belonging to a post, in creation order.
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
     * @notice Returns all direct replies to a given comment, in creation order.
     */
    function getCommentReplies(uint256 _commentId) external view returns (Comment[] memory) {
        require(_commentId > 0 && _commentId <= commentCount, "Comment not found");
        uint256[] storage ids = _commentReplyIds[_commentId];
        Comment[] memory out = new Comment[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            out[i] = _comments[ids[i]];
        }
        return out;
    }

    /**
     * @notice Returns all posts created by `_author`, newest-first.
     */
    function getPostsByAuthor(address _author)
        external
        view
        returns (Post[] memory posts)
    {
        uint256[] storage ids = _authorPostIds[_author];
        uint256 count = ids.length;
        posts = new Post[](count);
        for (uint256 i = 0; i < count; i++) {
            posts[i] = _posts[ids[count - 1 - i]]; // newest-first
        }
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
