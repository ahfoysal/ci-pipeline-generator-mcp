# ci-pipeline-generator-mcp

CI/CD pipeline generator MCP server. Generates, validates, caches, and optimizes pipeline configs for 6 platforms and 6 languages.

## Project Structure

```
src/
  index.ts          # Express + MCP server setup, tool registration, dev logging
  tools.ts          # Pure functions — all business logic (no MCP dependency)
tests/
  tools.test.ts     # Unit tests (vitest)
test-mcp.sh         # MCP protocol smoke test (curl-based)
```

## Key Commands

- `mcpize dev` — start local dev server (port 3000, hot reload, auto-loads .env)
- `mcpize dev --playground` — test tools interactively via browser playground
- `npm test` — run 21 unit tests with vitest
- `bash test-mcp.sh` — run 11 MCP protocol checks against running server
- `npm run build` — compile TypeScript to dist/
- `mcpize deploy` — deploy to MCPize Cloud

## Adding a New Tool

1. Add pure function + types in `src/tools.ts`
2. Register the tool in `src/index.ts` with `server.registerTool()`
3. Add unit tests in `tests/tools.test.ts`
4. Add smoke test call in `test-mcp.sh`

## Architecture

- **Computation-heavy** — no external APIs, zero running costs
- **6 platforms**: github-actions, gitlab-ci, circleci, azure-pipelines, bitbucket-pipelines, jenkins
- **6 languages**: node, python, go, rust, java, dotnet
- **Stateless** — no database, no caching layer needed
