export type RoomMode = "sharks" | "janta" | "roast";
export type Tier = "free" | "pro" | "deep";
export type RunStatus = "running" | "done" | "failed";

export type RunSummary = {
  id: string;
  mode: RoomMode;
  title: string;
  status: RunStatus;
  /** Sharks and Roast score out of 10. Janta has no score; see `metric`. */
  score: number | null;
  /** Janta headline number, e.g. "38% pay". */
  metric: string | null;
  cost: number;
  panelSize: number | null;
  demo: boolean;
  createdAt: number;
};

export type RunInput = {
  idea?: string;
  customer?: string;
  price?: string;
  tone?: "roast" | "serious";
  /** Sharks only: the investors speak aloud. */
  voice?: boolean;
  url?: string;
};

export type Prefs = {
  emailOnFinish: boolean;
  productUpdates: boolean;
};
