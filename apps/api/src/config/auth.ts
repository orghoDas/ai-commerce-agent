export type AuthenticatedUser = {
  userId: string;
  businessId: string;
  role: "OWNER" | "ADMIN" | "AGENT" | "VIEWER";
};

export function assertCanWriteCatalog(user: AuthenticatedUser) {
  if (!["OWNER", "ADMIN"].includes(user.role)) {
    throw new Error("FORBIDDEN");
  }
}

export function assertCanViewReports(user: AuthenticatedUser) {
  if (!["OWNER", "ADMIN", "VIEWER"].includes(user.role)) {
    throw new Error("FORBIDDEN");
  }
}

