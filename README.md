# ContextKeep

ContextKeep stores notes, code, links, and uploaded files in user-owned
workspaces. The library view is scoped to the selected workspace; search is
global across all workspaces belonging to the signed-in user. Search results
identify their workspace and open the original saved resource.

## Workspaces database migration

Apply `supabase/migrations/20261025210000_add_workspaces.sql` after the existing
resource and search migrations. It creates a Personal workspace for each
existing account, assigns existing resources to it, and creates a Personal
workspace automatically for new accounts. The migration also updates resource
creation and search RPCs. It does not require resources to be re-uploaded or
re-indexed.

Resources can be moved between a user's workspaces without changing their
content or embeddings. A workspace can only be deleted after its resources have
been moved or deleted. Workspace and resource ownership are enforced through
RLS and a composite database foreign key.

Collections can be created directly from the library sidebar and assigned to
resources when saving or editing them. Collection names are unique per user and
can be reused across workspaces. Existing collections can be renamed or deleted
from the sidebar; deleting a collection removes its membership links but keeps
the resources.