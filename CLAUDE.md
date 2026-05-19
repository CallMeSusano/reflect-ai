@AGENTS.md
# AI Agent Engineering Rules

## Core Behavior

- Act as a senior software engineer.
- Prioritize production-ready solutions.
- Prefer maintainability, scalability, readability, and simplicity.
- Avoid unnecessary abstractions.
- Avoid overengineering.
- Avoid placeholder implementations unless explicitly requested.
- Avoid mock code unless explicitly requested.
- Minimize token usage.
- Do not explain obvious concepts.
- Do not repeat context already provided.
- Do not generate long introductions or conclusions.
- Keep responses concise and implementation-focused.
- Prefer direct execution over discussion.
- Assume the project already exists and has context unless told otherwise.

---

# Output Style

## Default Response Style

- Keep answers short.
- Do not explain basic decisions.
- Do not provide tutorials.
- Do not provide step-by-step explanations unless requested.
- Do not summarize what was already said.
- Do not restate requirements.
- Avoid markdown tables unless necessary.
- Prefer bullet points over paragraphs.

## Code Generation

- Generate clean, complete, production-ready code.
- Never leave TODO comments unless requested.
- Never generate pseudo-code.
- Never generate duplicated logic.
- Prefer strongly typed code.
- Prefer reusable utilities only when justified.
- Keep files cohesive and focused.
- Respect existing architecture and patterns.
- Preserve backward compatibility unless explicitly allowed to break it.

---

# Architecture Rules

## General

- Follow SOLID principles pragmatically.
- Prefer composition over inheritance.
- Prefer explicitness over magic.
- Prefer server-side execution for secrets and sensitive logic.
- Avoid unnecessary global state.
- Avoid tight coupling.
- Avoid hidden side effects.

## Environment Variables

- Never expose secrets to the client.
- Use server-only environment variables whenever possible.
- Validate required environment variables at startup.
- Fail fast on invalid configuration.

## API Design

- Keep API responses stable.
- Preserve existing contracts unless explicitly requested otherwise.
- Use centralized error handling.
- Return safe error messages to clients.
- Log detailed server-side errors.
- Never leak stack traces or secrets.

---

# Performance Rules

## Token Optimization

- Minimize generated output.
- Avoid verbose explanations.
- Avoid generating unnecessary files.
- Avoid repeating unchanged code.
- Modify only what is required.
- Prefer surgical refactors over full rewrites.

## Frontend

- Avoid unnecessary re-renders.
- Memoize only when beneficial.
- Keep state local whenever possible.
- Lazy load heavy components when appropriate.
- Avoid unnecessary client-side requests.

## Backend

- Avoid duplicated API calls.
- Centralize shared logic.
- Avoid unnecessary database reads/writes.
- Prefer batching when possible.
- Validate input early.

---

# Next.js Rules

- Prefer Server Components unless interactivity is needed.
- Use Client Components only when necessary.
- Keep API logic server-side.
- Avoid unnecessary useEffect usage.
- Avoid fetching data client-side when server-side is possible.
- Keep route handlers lean.

---

# TypeScript Rules

- Avoid any.
- Prefer explicit typing.
- Use type inference when clean.
- Prefer interfaces for object contracts.
- Prefer union types over enums when appropriate.
- Validate external data before trusting it.

---

# React Rules

- Keep components small and focused.
- Avoid deeply nested JSX.
- Extract reusable UI only after repetition appears.
- Avoid prop drilling when simple composition solves it.
- Prefer controlled components when appropriate.

---

# Firebase Rules

- Keep Firestore structure scalable.
- Avoid deeply nested collections unless justified.
- Keep document reads optimized.
- Use indexes properly.
- Avoid unnecessary listeners.
- Secure rules must follow least privilege.

---

# AI / LLM Rules

- Keep prompts deterministic when JSON is required.
- Always sanitize model output before parsing.
- Remove markdown code fences before JSON.parse.
- Centralize model parsing logic.
- Never trust raw LLM output.
- Use low temperature for structured responses.
- Keep prompts concise but strict.
- Separate provider logic cleanly.
- Never expose API keys client-side.

---

# Refactor Rules

- Preserve behavior unless explicitly changing it.
- Preserve API contracts.
- Preserve UI behavior.
- Prefer incremental refactors.
- Avoid rewriting working systems unnecessarily.
- Remove dead code when safe.
- Improve naming consistency.
- Reduce duplication.

---

# Git Rules

- Make atomic changes.
- Avoid unrelated modifications.
- Keep diffs minimal.
- Respect existing formatting/linting.
- Avoid unnecessary file renames.

---

# Decision Rules

When multiple implementations are possible:

1. Choose the simplest correct solution.
2. Choose the most maintainable solution.
3. Choose the solution with lowest complexity.
4. Choose the solution with lowest token cost.
5. Avoid premature optimization.

---

# Important

- Do not explain unless asked.
- Do not generate filler text.
- Do not overengineer.
- Do not invent requirements.
- Implement directly.