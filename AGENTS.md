# AGENTS.md

Guidance for AI agents (and contributors) working in this repository.

## Testing

- Test runner: **mocha** with **chai** assertions (`npm test`), config in
  `.mocharc.json`. Specs live under `test/**/*.test.ts`.
- **Focus unit tests on this repo's own logic, not on the libraries or
  frameworks it depends on.** Code in `src/lib` and `src/services` — pure
  functions and filesystem-backed services — is what should be covered
  directly, the way `test/character-logic.test.ts` and
  `test/character-images.service.test.ts` already do.
- Don't add tools like Supertest to drive HTTP requests through Express
  just to test a route handler. Express, Zod, Nunjucks, etc. already have
  their own test suites — routing a request through the full framework
  mostly re-verifies that Express calls your handler and Express writes
  the response, not anything specific to this codebase.
- Route handlers in `src/views/**/*.views.ts` are kept thin on purpose:
  parse input → call an already-unit-tested function from `src/lib` or
  `src/services` → redirect/render. Verify that wiring by running the app
  (`npm run dev`) and clicking through the flow, not with HTTP-level test
  infrastructure.
