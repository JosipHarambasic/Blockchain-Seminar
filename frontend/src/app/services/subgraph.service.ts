import { Injectable } from "@angular/core";
import { HttpClient }  from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { environment } from "../../environments/environment";

// ─── Subgraph entity types ────────────────────────────────────────────────────

export interface SubgraphUser {
  id: string; // lowercase address
}

export interface SubgraphPost {
  id:           string; // entity id (= postId as string)
  postId:       string;
  author:       SubgraphUser;
  contentHash:  string; // bytes hex
  timestamp:    string;
  likeCount:    string;
  commentCount: string;
}

export interface SubgraphComment {
  id:              string;
  commentId:       string;
  post:            { id: string; postId: string };
  parentComment:   { id: string; commentId: string } | null;
  author:          SubgraphUser;
  contentHash:     string;
  timestamp:       string;
  likeCount:       string;
}

interface GraphQLResponse<T> {
  data:   T;
  errors?: { message: string }[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: "root" })
export class SubgraphService {
  private readonly url = environment.subgraphUrl;

  constructor(private http: HttpClient) {}

  private async _query<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const body = { query, variables };
    const resp = await firstValueFrom(
      this.http.post<GraphQLResponse<T>>(this.url, body)
    );
    if (resp.errors?.length) {
      throw new Error(resp.errors.map((e) => e.message).join("; "));
    }
    return resp.data;
  }

  // ─── Queries ─────────────────────────────────────────────────────────────

  async getPosts(skip = 0, first = 20): Promise<SubgraphPost[]> {
    const data = await this._query<{ posts: SubgraphPost[] }>(`
      query GetPosts($skip: Int!, $first: Int!) {
        posts(skip: $skip, first: $first, orderBy: timestamp, orderDirection: desc) {
          id postId
          author { id }
          contentHash timestamp likeCount commentCount
        }
      }
    `, { skip, first });
    return data.posts;
  }

  async getPostById(postId: string): Promise<SubgraphPost | null> {
    const data = await this._query<{ post: SubgraphPost | null }>(`
      query GetPost($id: ID!) {
        post(id: $id) {
          id postId
          author { id }
          contentHash timestamp likeCount commentCount
        }
      }
    `, { id: postId });
    return data.post;
  }

  async getCommentsByPost(postId: string): Promise<SubgraphComment[]> {
    const data = await this._query<{ comments: SubgraphComment[] }>(`
      query GetComments($postId: String!) {
        comments(where: { post: $postId, parentComment: null }, orderBy: timestamp, orderDirection: asc) {
          id commentId
          post { id postId }
          parentComment { id commentId }
          author { id }
          contentHash timestamp likeCount
        }
      }
    `, { postId });
    return data.comments;
  }

  async getRepliesByComment(commentId: string): Promise<SubgraphComment[]> {
    const data = await this._query<{ comments: SubgraphComment[] }>(`
      query GetReplies($parentId: String!) {
        comments(where: { parentComment: $parentId }, orderBy: timestamp, orderDirection: asc) {
          id commentId
          post { id postId }
          parentComment { id commentId }
          author { id }
          contentHash timestamp likeCount
        }
      }
    `, { parentId: commentId });
    return data.comments;
  }

  async getPostsByUser(userAddress: string): Promise<SubgraphPost[]> {
    const id = userAddress.toLowerCase();
    const data = await this._query<{ posts: SubgraphPost[] }>(`
      query GetUserPosts($author: String!) {
        posts(where: { author: $author }, orderBy: timestamp, orderDirection: desc) {
          id postId
          author { id }
          contentHash timestamp likeCount commentCount
        }
      }
    `, { author: id });
    return data.posts;
  }
}
