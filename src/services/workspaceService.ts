import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Workspace } from "@/types/resource";

type WorkspaceRow = Pick<
  Database["public"]["Tables"]["workspaces"]["Row"],
  "id" | "name" | "description" | "created_at" | "updated_at"
>;

export async function listWorkspaces(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Workspace[]> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("id,name,description,created_at,updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Unable to load workspaces: ${error.message}`);
  return (data ?? []).map(mapWorkspace);
}

export async function createWorkspace(
  supabase: SupabaseClient<Database>,
  userId: string,
  name: string,
): Promise<Workspace> {
  const { data, error } = await supabase
    .from("workspaces")
    .insert({ user_id: userId, name })
    .select("id,name,description,created_at,updated_at")
    .single();
  if (error) throw new Error(`Unable to create workspace: ${error.message}`);
  return mapWorkspace(data);
}

export async function renameWorkspace(
  supabase: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  name: string,
): Promise<Workspace> {
  const { data, error } = await supabase
    .from("workspaces")
    .update({ name })
    .eq("id", workspaceId)
    .eq("user_id", userId)
    .select("id,name,description,created_at,updated_at")
    .maybeSingle();
  if (error) throw new Error(`Unable to rename workspace: ${error.message}`);
  if (!data) throw new Error("Workspace not found or access denied.");
  return mapWorkspace(data);
}

export async function deleteWorkspace(
  supabase: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
): Promise<void> {
  const { count, error: countError } = await supabase
    .from("resources")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  if (countError) {
    throw new Error(`Unable to check workspace resources: ${countError.message}`);
  }
  if (count) {
    throw new Error("Move or delete this workspace’s resources before deleting it.");
  }

  const { data, error } = await supabase
    .from("workspaces")
    .delete()
    .eq("id", workspaceId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Unable to delete workspace: ${error.message}`);
  if (!data) throw new Error("Workspace not found or access denied.");
}

export async function moveResource(
  supabase: SupabaseClient<Database>,
  resourceId: string,
  workspaceId: string,
): Promise<void> {
  const { error } = await supabase.rpc("move_resource_to_workspace", {
    p_resource_id: resourceId,
    p_workspace_id: workspaceId,
  });
  if (error) throw new Error(`Unable to move resource: ${error.message}`);
}

function mapWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
  };
}
