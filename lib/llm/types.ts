// Branded input types for the LLM boundary. These exist to make the
// wrong thing not compile.
//
// The security model: a parent's raw question is untrusted input. It
// must not reach the system role, it must not reach the tool-choice
// field, it must not reach anywhere other than a JSON-escaped string
// inside the user_query field of an MCPData envelope. Enforcing that
// at runtime would require a code review of every call site. Enforcing
// it with brands pushes the check to the type system: only a function
// with the right branded parameter type can accept a SystemPrompt, and
// the only place a string becomes a SystemPrompt is the constructor
// below. A reviewer grepping for `as SystemPrompt` outside this file
// has found a bug.
//
// The constructors in this file are the *only* legitimate casts in the
// codebase. Any other `as SystemPrompt`, `as UserInput`, etc. is a
// finding for review-mcp-boundary.

declare const SystemPromptBrand: unique symbol;
declare const AppIntentBrand: unique symbol;
declare const MCPDataBrand: unique symbol;
declare const UserInputBrand: unique symbol;

export type SystemPrompt = string & {
  readonly [SystemPromptBrand]: true;
};
export type AppIntent = string & {
  readonly [AppIntentBrand]: true;
};
export type MCPData = {
  readonly value: Record<string, unknown>;
} & { readonly [MCPDataBrand]: true };
export type UserInput = string & {
  readonly [UserInputBrand]: true;
};

// ---------------------------------------------------------------------------
// Constructors — the only place a raw value becomes a branded value
// ---------------------------------------------------------------------------

export function SystemPrompt(value: string): SystemPrompt {
  if (value.length === 0) {
    throw new Error("SystemPrompt may not be empty");
  }
  return value as SystemPrompt;
}

export function AppIntent(value: string): AppIntent {
  if (value.length === 0) {
    throw new Error("AppIntent may not be empty");
  }
  return value as AppIntent;
}

export function MCPData(value: Record<string, unknown>): MCPData {
  return { value } as MCPData;
}

// UserInput enforces a length cap at construction time so there is no
// way to bypass it further down the pipeline. A 4000-character cap
// fits any reasonable parent question and keeps the prompt budget
// bounded regardless of what a caller forgets to check.
export function UserInput(value: string): UserInput {
  if (value.length === 0) {
    throw new Error("UserInput may not be empty");
  }
  if (value.length > 4000) {
    throw new Error(`UserInput exceeds max length: ${value.length} > 4000`);
  }
  return value as UserInput;
}
