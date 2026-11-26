export type FormState =
  | {
      error?: string;
      ok?: string;
      fieldErrors?: Record<string, string>;
      values?: Record<string, string>;
    }
  | undefined;
