export type ActionResult<T> =
  | { success: true; data: T; warning?: string }
  | { success: false; error: string };
