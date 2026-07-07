export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export type ModuleStatus = "idle" | "monitoring" | "active" | "alert";

export interface ModuleMeta {
  code: string;
  name: string;
  description: string;
  status: ModuleStatus;
}
