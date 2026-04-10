import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import { z } from "zod";
import chalk from "chalk";
import {
  generatePipeline,
  validatePipeline,
  addCaching,
  optimizePipeline,
  convertPipeline,
  addSecurityScanning,
  addParallelization,
  generateMonorepoPipeline,
  addDeployment,
  estimateBuildTime,
} from "./tools.js";

// ============================================================================
// Dev Logging Utilities
// ============================================================================

const isDev = process.env.NODE_ENV !== "production";

function timestamp(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function formatLatency(ms: number): string {
  if (ms < 100) return chalk.green(`${ms}ms`);
  if (ms < 500) return chalk.yellow(`${ms}ms`);
  return chalk.red(`${ms}ms`);
}

function truncate(str: string, maxLen = 60): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

function logRequest(method: string, params?: unknown): void {
  if (!isDev) return;

  const paramsStr = params ? chalk.gray(` ${truncate(JSON.stringify(params))}`) : "";
  console.log(`${chalk.gray(`[${timestamp()}]`)} ${chalk.cyan("→")} ${method}${paramsStr}`);
}

function logResponse(method: string, result: unknown, latencyMs: number): void {
  if (!isDev) return;

  const latency = formatLatency(latencyMs);

  // For tool calls, show the result
  if (method === "tools/call" && result) {
    const resultStr = typeof result === "string" ? result : JSON.stringify(result);
    console.log(
      `${chalk.gray(`[${timestamp()}]`)} ${chalk.green("←")} ${truncate(resultStr)} ${chalk.gray(`(${latency})`)}`
    );
  } else {
    console.log(`${chalk.gray(`[${timestamp()}]`)} ${chalk.green("✓")} ${method} ${chalk.gray(`(${latency})`)}`);
  }
}

function logError(method: string, error: unknown, latencyMs: number): void {
  const latency = formatLatency(latencyMs);

  let errorMsg: string;
  if (error instanceof Error) {
    errorMsg = error.message;
  } else if (typeof error === "object" && error !== null) {
    // JSON-RPC error object has { code, message, data? }
    const rpcError = error as { message?: string; code?: number };
    errorMsg = rpcError.message || `Error ${rpcError.code || "unknown"}`;
  } else {
    errorMsg = String(error);
  }

  console.log(
    `${chalk.gray(`[${timestamp()}]`)} ${chalk.red("✖")} ${method} ${chalk.red(truncate(errorMsg))} ${chalk.gray(`(${latency})`)}`
  );
}

// ============================================================================
// MCP Server Setup
// ============================================================================

const server = new McpServer({
  name: "ci-pipeline-generator-mcp",
  version: "1.0.0",
});

// ── Tool: generate_pipeline ──────────────────────────────────────────────────
server.registerTool(
  "generate_pipeline",
  {
    title: "Generate CI/CD Pipeline",
    description:
      "Generate a complete CI/CD pipeline config from a project description. Supports GitHub Actions, GitLab CI, CircleCI, Azure Pipelines, Bitbucket Pipelines, and Jenkins.",
    inputSchema: {
      platform: z
        .enum([
          "github-actions",
          "gitlab-ci",
          "circleci",
          "azure-pipelines",
          "bitbucket-pipelines",
          "jenkins",
        ])
        .describe("CI/CD platform to generate config for"),
      language: z
        .enum(["node", "python", "go", "rust", "java", "dotnet"])
        .describe("Primary programming language of the project"),
      framework: z
        .string()
        .optional()
        .describe("Framework (e.g., next, django, gin) — optional"),
      features: z
        .array(
          z.enum(["test", "lint", "build", "docker", "deploy", "cache", "security"])
        )
        .describe("Pipeline features to include"),
    },
    outputSchema: {
      yaml: z.string(),
      platform: z.string(),
      language: z.string(),
      features_included: z.array(z.string()),
      estimated_duration: z.string(),
    },
  },
  async ({ platform, language, framework, features }) => {
    try {
      const output = generatePipeline({ platform, language, framework, features });
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: message,
              suggestion: "Check that the platform, language, and features are valid.",
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ── Tool: validate_pipeline ──────────────────────────────────────────────────
server.registerTool(
  "validate_pipeline",
  {
    title: "Validate Pipeline",
    description:
      "Validate a CI/CD pipeline YAML config for syntax errors, missing fields, and best-practice violations. Returns a score (0-100) and actionable fix suggestions.",
    inputSchema: {
      yaml_content: z.string().describe("The pipeline YAML content to validate"),
      platform: z
        .enum([
          "github-actions",
          "gitlab-ci",
          "circleci",
          "azure-pipelines",
          "bitbucket-pipelines",
          "jenkins",
        ])
        .describe("Which CI/CD platform this config is for"),
    },
    outputSchema: {
      valid: z.boolean(),
      score: z.number(),
      issues: z.array(
        z.object({
          severity: z.string(),
          message: z.string(),
          line: z.number().optional(),
          fix: z.string().optional(),
        })
      ),
      suggestions: z.array(z.string()),
    },
  },
  async ({ yaml_content, platform }) => {
    try {
      const output = validatePipeline({ yaml_content, platform });
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: message, suggestion: "Ensure the YAML content is a string." }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ── Tool: add_caching ────────────────────────────────────────────────────────
server.registerTool(
  "add_caching",
  {
    title: "Add Caching",
    description:
      "Add intelligent dependency caching to an existing CI/CD pipeline config. Auto-detects the platform and inserts the correct caching steps.",
    inputSchema: {
      yaml_content: z.string().describe("Existing pipeline YAML to add caching to"),
      package_manager: z
        .enum([
          "npm",
          "yarn",
          "pnpm",
          "pip",
          "poetry",
          "go-modules",
          "cargo",
          "maven",
          "gradle",
          "dotnet",
        ])
        .describe("Package manager used by the project"),
    },
    outputSchema: {
      yaml: z.string(),
      cache_strategy: z.string(),
      estimated_time_saved: z.string(),
    },
  },
  async ({ yaml_content, package_manager }) => {
    try {
      const output = addCaching({ yaml_content, package_manager });
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: message, suggestion: "Provide valid YAML content." }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ── Tool: optimize_pipeline ──────────────────────────────────────────────────
server.registerTool(
  "optimize_pipeline",
  {
    title: "Optimize Pipeline",
    description:
      "Analyze an existing CI/CD pipeline and apply optimizations: parallelize jobs, add concurrency groups, enable fail-fast, and detect missing steps.",
    inputSchema: {
      yaml_content: z.string().describe("Pipeline YAML to optimize"),
    },
    outputSchema: {
      yaml: z.string(),
      optimizations_applied: z.array(
        z.object({
          type: z.string(),
          description: z.string(),
          impact: z.string(),
        })
      ),
      estimated_speedup: z.string(),
    },
  },
  async ({ yaml_content }) => {
    try {
      const output = optimizePipeline({ yaml_content });
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: message, suggestion: "Provide valid YAML content." }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ── Tool: convert_pipeline ───────────────────────────────────────────────────
server.registerTool(
  "convert_pipeline",
  {
    title: "Convert Pipeline",
    description:
      "Convert a CI/CD pipeline between platforms. E.g., GitHub Actions → GitLab CI, CircleCI → Azure Pipelines. Auto-detects language and features from the source config.",
    inputSchema: {
      yaml_content: z.string().describe("Source pipeline YAML to convert"),
      source_platform: z.enum(["github-actions", "gitlab-ci", "circleci", "azure-pipelines", "bitbucket-pipelines", "jenkins"]).describe("Current platform"),
      target_platform: z.enum(["github-actions", "gitlab-ci", "circleci", "azure-pipelines", "bitbucket-pipelines", "jenkins"]).describe("Target platform to convert to"),
    },
    outputSchema: {
      yaml: z.string(),
      source_platform: z.string(),
      target_platform: z.string(),
      conversion_notes: z.array(z.string()),
    },
  },
  async ({ yaml_content, source_platform, target_platform }) => {
    try {
      const output = convertPipeline({ yaml_content, source_platform, target_platform });
      return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
    } catch (error) {
      return { content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }], isError: true };
    }
  }
);

// ── Tool: add_security_scanning ──────────────────────────────────────────────
server.registerTool(
  "add_security_scanning",
  {
    title: "Add Security Scanning",
    description:
      "Add security scanning steps to a CI/CD pipeline: SAST, dependency auditing, secrets detection, container scanning, and license checks. Auto-detects language and platform.",
    inputSchema: {
      yaml_content: z.string().describe("Pipeline YAML to add security scanning to"),
      scanners: z.array(z.enum(["sast", "dependency-audit", "secrets-detection", "container-scan", "license-check"])).describe("Security scanners to add"),
    },
    outputSchema: {
      yaml: z.string(),
      scanners_added: z.array(z.string()),
      notes: z.array(z.string()),
    },
  },
  async ({ yaml_content, scanners }) => {
    try {
      const output = addSecurityScanning({ yaml_content, scanners });
      return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
    } catch (error) {
      return { content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }], isError: true };
    }
  }
);

// ── Tool: add_parallelization ────────────────────────────────────────────────
server.registerTool(
  "add_parallelization",
  {
    title: "Add Parallelization",
    description:
      "Split a single-job pipeline into parallel jobs. Categorizes steps (lint, test, build, security, deploy) and creates a dependency graph. Lint/test/security run in parallel; build depends on them; deploy depends on build.",
    inputSchema: {
      yaml_content: z.string().describe("Pipeline YAML with a single job to parallelize"),
    },
    outputSchema: {
      yaml: z.string(),
      jobs_created: z.array(z.string()),
      dependency_graph: z.string(),
      estimated_speedup: z.string(),
    },
  },
  async ({ yaml_content }) => {
    try {
      const output = addParallelization({ yaml_content });
      return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
    } catch (error) {
      return { content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }], isError: true };
    }
  }
);

// ── Tool: generate_monorepo_pipeline ─────────────────────────────────────────
server.registerTool(
  "generate_monorepo_pipeline",
  {
    title: "Generate Monorepo Pipeline",
    description:
      "Generate a CI/CD pipeline for a monorepo with multiple services. Each service gets its own job with path-based triggers so only changed services are built.",
    inputSchema: {
      services: z.array(z.object({
        name: z.string().describe("Service name (e.g., 'api', 'web', 'worker')"),
        path: z.string().describe("Path within monorepo (e.g., 'packages/api')"),
        language: z.enum(["node", "python", "go", "rust", "java", "dotnet"]).describe("Service language"),
        features: z.array(z.enum(["test", "lint", "build", "docker", "deploy", "cache", "security"])).describe("Features for this service"),
      })).describe("List of services in the monorepo"),
      platform: z.enum(["github-actions", "gitlab-ci", "circleci", "azure-pipelines", "bitbucket-pipelines", "jenkins"]).describe("CI/CD platform"),
    },
    outputSchema: {
      yaml: z.string(),
      platform: z.string(),
      services_count: z.number(),
      dependency_graph: z.string(),
    },
  },
  async ({ services, platform }) => {
    try {
      const output = generateMonorepoPipeline({ services, platform });
      return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
    } catch (error) {
      return { content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }], isError: true };
    }
  }
);

// ── Tool: add_deployment ─────────────────────────────────────────────────────
server.registerTool(
  "add_deployment",
  {
    title: "Add Deployment",
    description:
      "Add deployment steps to a CI/CD pipeline. Supports Vercel, Netlify, AWS ECS, AWS Lambda, GCP Cloud Run, Heroku, Docker Hub, GitHub Pages, and Fly.io. Creates a deploy job that depends on all existing jobs.",
    inputSchema: {
      yaml_content: z.string().describe("Pipeline YAML to add deployment to"),
      deploy_target: z.enum(["vercel", "netlify", "aws-ecs", "aws-lambda", "gcp-cloudrun", "heroku", "docker-hub", "github-pages", "fly-io"]).describe("Where to deploy"),
      environment: z.enum(["staging", "production"]).describe("Deployment environment"),
    },
    outputSchema: {
      yaml: z.string(),
      deploy_target: z.string(),
      environment: z.string(),
      required_secrets: z.array(z.string()),
      notes: z.array(z.string()),
    },
  },
  async ({ yaml_content, deploy_target, environment }) => {
    try {
      const output = addDeployment({ yaml_content, deploy_target, environment });
      return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
    } catch (error) {
      return { content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }], isError: true };
    }
  }
);

// ── Tool: estimate_build_time ────────────────────────────────────────────────
server.registerTool(
  "estimate_build_time",
  {
    title: "Estimate Build Time",
    description:
      "Estimate how long a CI/CD pipeline will take to run. Breaks down time per step, identifies the bottleneck, and suggests whether parallelization would help.",
    inputSchema: {
      yaml_content: z.string().describe("Pipeline YAML to estimate"),
    },
    outputSchema: {
      total_estimated_seconds: z.number(),
      total_estimated_display: z.string(),
      steps: z.array(z.object({
        name: z.string(),
        estimated_seconds: z.number(),
        category: z.string(),
      })),
      bottleneck: z.string(),
      parallelizable: z.boolean(),
      parallel_estimate_display: z.string(),
    },
  },
  async ({ yaml_content }) => {
    try {
      const output = estimateBuildTime({ yaml_content });
      return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
    } catch (error) {
      return { content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }], isError: true };
    }
  }
);

// ============================================================================
// Express App Setup
// ============================================================================

const app = express();
app.use(express.json());

// Health check endpoint (required for Cloud Run)
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "healthy" });
});

// MCP endpoint with dev logging
app.post("/mcp", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const body = req.body;

  // Extract method and params from JSON-RPC request
  const method = body?.method || "unknown";
  const params = body?.params;

  // Log incoming request
  if (method === "tools/call") {
    const toolName = params?.name || "unknown";
    const toolArgs = params?.arguments;
    logRequest(`tools/call ${chalk.bold(toolName)}`, toolArgs);
  } else if (method !== "notifications/initialized") {
    logRequest(method, params);
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  // Capture response body for logging
  let responseBody = "";
  const originalWrite = res.write.bind(res) as typeof res.write;
  const originalEnd = res.end.bind(res) as typeof res.end;

  res.write = function (chunk: unknown, encodingOrCallback?: BufferEncoding | ((error: Error | null | undefined) => void), callback?: (error: Error | null | undefined) => void) {
    if (chunk) {
      responseBody += typeof chunk === "string" ? chunk : Buffer.from(chunk as ArrayBuffer).toString();
    }
    return originalWrite(chunk as string, encodingOrCallback as BufferEncoding, callback);
  };

  res.end = function (chunk?: unknown, encodingOrCallback?: BufferEncoding | (() => void), callback?: () => void) {
    if (chunk) {
      responseBody += typeof chunk === "string" ? chunk : Buffer.from(chunk as ArrayBuffer).toString();
    }

    // Log response
    if (method !== "notifications/initialized") {
      const latency = Date.now() - startTime;

      try {
        const rpcResponse = JSON.parse(responseBody) as { result?: unknown; error?: unknown };

        if (rpcResponse?.error) {
          logError(method, rpcResponse.error, latency);
        } else if (method === "tools/call") {
          const content = (rpcResponse?.result as { content?: Array<{ text?: string }> })?.content;
          const resultText = content?.[0]?.text;
          logResponse(method, resultText, latency);
        } else {
          logResponse(method, null, latency);
        }
      } catch {
        logResponse(method, null, latency);
      }
    }

    return originalEnd(chunk as string, encodingOrCallback as BufferEncoding, callback);
  };

  res.on("close", () => {
    transport.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// JSON error handler (Express defaults to HTML errors)
app.use((_err: unknown, _req: Request, res: Response, _next: Function) => {
  res.status(500).json({ error: "Internal server error" });
});

// ============================================================================
// Start Server
// ============================================================================

const port = parseInt(process.env.PORT || "8080");
const httpServer = app.listen(port, () => {
  console.log();
  console.log(chalk.bold("MCP Server running on"), chalk.cyan(`http://localhost:${port}`));
  console.log(`  ${chalk.gray("Health:")} http://localhost:${port}/health`);
  console.log(`  ${chalk.gray("MCP:")}    http://localhost:${port}/mcp`);

  if (isDev) {
    console.log();
    console.log(chalk.gray("─".repeat(50)));
    console.log();
  }
});

// Graceful shutdown for Cloud Run (SIGTERM before kill)
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down...");
  httpServer.close(() => {
    process.exit(0);
  });
});
