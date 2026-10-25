export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      resources: Table<
        {
          id: string;
          user_id: string;
          title: string;
          resource_type: "url" | "note" | "code" | "file";
          url: string | null;
          content: string | null;
          language: string | null;
          file_name: string | null;
          mime_type: string | null;
          is_favorite: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          title: string;
          resource_type: "url" | "note" | "code" | "file";
          url?: string | null;
          content?: string | null;
          language?: string | null;
          file_name?: string | null;
          mime_type?: string | null;
          is_favorite?: boolean;
          created_at?: string;
          updated_at?: string;
        },
        {
          title?: string;
          resource_type?: "url" | "note" | "code" | "file";
          url?: string | null;
          content?: string | null;
          language?: string | null;
          file_name?: string | null;
          mime_type?: string | null;
          is_favorite?: boolean;
          updated_at?: string;
        }
      >;
      collections: Table<
        {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        {
          name?: string;
          description?: string | null;
          updated_at?: string;
        }
      >;
      collection_resources: Table<
        {
          collection_id: string;
          resource_id: string;
          user_id: string;
          created_at: string;
        },
        {
          collection_id: string;
          resource_id: string;
          user_id: string;
          created_at?: string;
        },
        {
          collection_id?: string;
          resource_id?: string;
          user_id?: string;
        }
      >;
      tags: Table<
        {
          id: string;
          user_id: string;
          name: string;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          name: string;
          created_at?: string;
        },
        {
          name?: string;
        }
      >;
      resource_tags: Table<
        {
          resource_id: string;
          tag_id: string;
          user_id: string;
          created_at: string;
        },
        {
          resource_id: string;
          tag_id: string;
          user_id: string;
          created_at?: string;
        },
        {
          resource_id?: string;
          tag_id?: string;
          user_id?: string;
        }
      >;
      resource_files: Table<
        {
          id: string;
          resource_id: string;
          user_id: string;
          storage_path: string;
          original_filename: string;
          mime_type: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
          file_size: number;
          created_at: string;
        },
        {
          id?: string;
          resource_id: string;
          user_id: string;
          storage_path: string;
          original_filename: string;
          mime_type: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
          file_size: number;
          created_at?: string;
        },
        {
          storage_path?: string;
          original_filename?: string;
          mime_type?: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
          file_size?: number;
        }
      >;
      resource_chunks: Table<
        {
          id: string;
          resource_id: string;
          user_id: string;
          chunk_index: number;
          content: string;
          embedding: string;
          content_hash: string;
          resource_updated_at: string;
          created_at: string;
        },
        {
          id?: string;
          resource_id: string;
          user_id: string;
          chunk_index: number;
          content: string;
          embedding: string;
          content_hash: string;
          resource_updated_at: string;
          created_at?: string;
        },
        {
          content?: string;
          embedding?: string;
          content_hash?: string;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      create_resource_with_relations: {
        Args: {
          p_title: string;
          p_resource_type: "url" | "note" | "code" | "file";
          p_url: string | null;
          p_content: string | null;
          p_language: string | null;
          p_file_name: string | null;
          p_mime_type: string | null;
          p_collection_names: string[];
          p_tags: string[];
        };
        Returns: string;
      };
      update_resource_with_relations: {
        Args: {
          p_resource_id: string;
          p_title: string;
          p_resource_type: "url" | "note" | "code" | "file";
          p_url: string | null;
          p_content: string | null;
          p_language: string | null;
          p_file_name: string | null;
          p_mime_type: string | null;
          p_collection_names: string[];
          p_tags: string[];
        };
        Returns: undefined;
      };
      replace_resource_chunks: {
        Args: {
          p_resource_id: string;
          p_resource_updated_at: string;
          p_content_hash: string | null;
          p_contents: string[];
          p_embeddings: string[];
        };
        Returns: undefined;
      };
      search_resource_chunks: {
        Args: {
          p_query_embedding: string;
          p_match_count?: number;
        };
        Returns: Array<{
          resource_id: string;
          title: string;
          resource_type: "url" | "note" | "code" | "file";
          matched_text: string;
          distance: number;
        }>;
      };
      search_resource_chunks_keyword: {
        Args: {
          p_query: string;
          p_match_count?: number;
        };
        Returns: Array<{
          resource_id: string;
          title: string;
          resource_type: "url" | "note" | "code" | "file";
          matched_text: string;
          keyword_score: number;
          exact_match: boolean;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
