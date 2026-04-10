# CI Pipeline Generator

Generate optimized CI/CD pipeline configs for GitHub Actions, GitLab CI, CircleCI, Azure Pipelines, Bitbucket Pipelines, and Jenkins from project descriptions.

[![Available on MCPize](https://img.shields.io/badge/MCPize-Available-blue)](https://mcpize.com/mcp/ci-pipeline-generator-mcp)

## Connect via MCPize

```bash
npx -y mcpize connect @ahfoysal30/ci-pipeline-generator-mcp --client claude
```

Or visit: https://mcpize.com/mcp/ci-pipeline-generator-mcp

### Per-client install

```
Claude:    claude mcp add --transport http ci-pipeline-generator https://ci-pipeline-generator-mcp.mcpize.run
Cursor:    cursor mcp add ci-pipeline-generator https://ci-pipeline-generator-mcp.mcpize.run
Windsurf:  windsurf mcp add ci-pipeline-generator https://ci-pipeline-generator-mcp.mcpize.run
```

### JSON config (manual)

```json
{
  "mcpServers": {
    "ci-pipeline-generator": {
      "url": "https://ci-pipeline-generator-mcp.mcpize.run"
    }
  }
}
```

## Tools (10)

| Tool | Description |
|------|-------------|
| `generate_pipeline` | Generate a complete CI/CD pipeline from platform, language, and features |
| `validate_pipeline` | Validate pipeline YAML for syntax, missing fields, and best practices (scored 0-100) |
| `add_caching` | Add intelligent dependency caching for 10 package managers |
| `optimize_pipeline` | Parallelize jobs, add concurrency groups, detect missing steps |
| `convert_pipeline` | Convert between any 2 CI/CD platforms |
| `add_security_scanning` | Add SAST, dependency audit, secrets detection, container scan |
| `add_parallelization` | Split single job into parallel dependency graph |
| `generate_monorepo_pipeline` | Multi-service pipeline with path-based triggers |
| `add_deployment` | Add deploy to Vercel, Netlify, AWS, GCP, Heroku, Fly.io, etc. |
| `estimate_build_time` | Estimate duration per step and identify bottleneck |

### Supported Platforms
GitHub Actions, GitLab CI, CircleCI, Azure Pipelines, Bitbucket Pipelines, Jenkins

### Supported Languages
Node.js, Python, Go, Rust, Java, .NET

## Pricing

| Tier | Price | Calls/day | Features |
|------|-------|-----------|----------|
| Free | $0 | 10 | GitHub Actions only |
| Pro | $15/mo | 100 | All platforms, caching, security |
| Team | $29/mo | 500 | Monorepo, custom templates |
| Enterprise | $79/mo | Unlimited | Everything |

## Development

```bash
npm install
mcpize dev              # Dev server (port 3000, hot reload)
mcpize dev --playground # Interactive browser playground
npm test                # 38 unit tests
bash test-mcp.sh        # 17 MCP protocol checks
npm run build           # Compile TypeScript
```

## Project Structure

```
src/
  index.ts        # MCP server + 10 tool registrations
  tools.ts        # Pure functions (testable, no MCP dependency)
tests/
  tools.test.ts   # 38 unit tests
test-mcp.sh       # MCP protocol smoke test
```

## License

MIT
