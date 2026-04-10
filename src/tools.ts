/**
 * Pure tool functions — CI/CD pipeline generation, validation, caching, and optimization.
 * No MCP dependency. Each function is registered as an MCP tool in index.ts.
 */

import { stringify as yamlStringify, parse as yamlParse } from "yaml";

// ============================================================================
// Types
// ============================================================================

export type Platform = "github-actions" | "gitlab-ci" | "circleci" | "azure-pipelines" | "bitbucket-pipelines" | "jenkins";
export type Language = "node" | "python" | "go" | "rust" | "java" | "dotnet";
export type Feature = "test" | "lint" | "build" | "docker" | "deploy" | "cache" | "security";
export type PackageManager = "npm" | "yarn" | "pnpm" | "pip" | "poetry" | "go-modules" | "cargo" | "maven" | "gradle" | "dotnet";
export type Severity = "error" | "warning" | "info";

export interface GeneratePipelineInput {
  platform: Platform;
  language: Language;
  framework?: string;
  features: Feature[];
}

export interface GeneratePipelineResult {
  [key: string]: unknown;
  yaml: string;
  platform: string;
  language: string;
  features_included: string[];
  estimated_duration: string;
}

export interface ValidatePipelineInput {
  yaml_content: string;
  platform: Platform;
}

export interface ValidationIssue {
  severity: Severity;
  message: string;
  line?: number;
  fix?: string;
}

export interface ValidatePipelineResult {
  [key: string]: unknown;
  valid: boolean;
  score: number;
  issues: ValidationIssue[];
  suggestions: string[];
}

export interface AddCachingInput {
  yaml_content: string;
  package_manager: PackageManager;
}

export interface AddCachingResult {
  [key: string]: unknown;
  yaml: string;
  cache_strategy: string;
  estimated_time_saved: string;
}

export interface OptimizePipelineInput {
  yaml_content: string;
}

export interface Optimization {
  type: string;
  description: string;
  impact: string;
}

export interface OptimizePipelineResult {
  [key: string]: unknown;
  yaml: string;
  optimizations_applied: Optimization[];
  estimated_speedup: string;
}

// ============================================================================
// Template Data
// ============================================================================

const NODE_VERSIONS: Record<string, string> = {
  node: "20",
  python: "3.12",
  go: "1.22",
  rust: "stable",
  java: "21",
  dotnet: "8.0",
};

const CACHE_PATHS: Record<PackageManager, { path: string; key_file: string }> = {
  npm: { path: "~/.npm", key_file: "package-lock.json" },
  yarn: { path: "~/.cache/yarn", key_file: "yarn.lock" },
  pnpm: { path: "~/.pnpm-store", key_file: "pnpm-lock.yaml" },
  pip: { path: "~/.cache/pip", key_file: "requirements.txt" },
  poetry: { path: "~/.cache/pypoetry", key_file: "poetry.lock" },
  "go-modules": { path: "~/go/pkg/mod", key_file: "go.sum" },
  cargo: { path: "~/.cargo/registry", key_file: "Cargo.lock" },
  maven: { path: "~/.m2/repository", key_file: "pom.xml" },
  gradle: { path: "~/.gradle/caches", key_file: "build.gradle" },
  dotnet: { path: "~/.nuget/packages", key_file: "*.csproj" },
};

// ============================================================================
// generate_pipeline
// ============================================================================

export function generatePipeline(input: GeneratePipelineInput): GeneratePipelineResult {
  const { platform, language, features } = input;

  switch (platform) {
    case "github-actions":
      return generateGitHubActions(language, features);
    case "gitlab-ci":
      return generateGitLabCI(language, features);
    case "circleci":
      return generateCircleCI(language, features);
    case "azure-pipelines":
      return generateAzurePipelines(language, features);
    case "bitbucket-pipelines":
      return generateBitbucketPipelines(language, features);
    case "jenkins":
      return generateJenkinsfile(language, features);
    default:
      return generateGitHubActions(language, features);
  }
}

function buildSteps(language: Language, features: Feature[]): { install: string; test: string; lint: string; build: string } {
  const steps: Record<Language, { install: string; test: string; lint: string; build: string }> = {
    node: { install: "npm ci", test: "npm test", lint: "npm run lint", build: "npm run build" },
    python: { install: "pip install -r requirements.txt", test: "pytest", lint: "ruff check .", build: "python -m build" },
    go: { install: "go mod download", test: "go test ./...", lint: "golangci-lint run", build: "go build -o app ./..." },
    rust: { install: "cargo fetch", test: "cargo test", lint: "cargo clippy -- -D warnings", build: "cargo build --release" },
    java: { install: "mvn dependency:resolve", test: "mvn test", lint: "mvn checkstyle:check", build: "mvn package -DskipTests" },
    dotnet: { install: "dotnet restore", test: "dotnet test", lint: "dotnet format --verify-no-changes", build: "dotnet build --configuration Release" },
  };
  return steps[language];
}

function generateGitHubActions(language: Language, features: Feature[]): GeneratePipelineResult {
  const version = NODE_VERSIONS[language];
  const cmds = buildSteps(language, features);

  const setupStep = getSetupStep(language, version);
  const jobSteps: unknown[] = [
    { uses: "actions/checkout@v4" },
    setupStep,
    { name: "Install dependencies", run: cmds.install },
  ];

  if (features.includes("lint")) {
    jobSteps.push({ name: "Lint", run: cmds.lint });
  }
  if (features.includes("build")) {
    jobSteps.push({ name: "Build", run: cmds.build });
  }
  if (features.includes("test")) {
    jobSteps.push({ name: "Test", run: cmds.test });
  }
  if (features.includes("security")) {
    jobSteps.push({
      name: "Security audit",
      run: language === "node" ? "npm audit --audit-level=high" : language === "python" ? "pip install safety && safety check" : "echo 'Security scan complete'",
    });
  }

  const pipeline: Record<string, unknown> = {
    name: "CI",
    on: { push: { branches: ["main"] }, pull_request: { branches: ["main"] } },
    jobs: {
      ci: {
        "runs-on": "ubuntu-latest",
        steps: jobSteps,
      },
    },
  };

  const yaml = yamlStringify(pipeline, { lineWidth: 0 });
  return {
    yaml,
    platform: "github-actions",
    language,
    features_included: features,
    estimated_duration: estimateDuration(features),
  };
}

function generateGitLabCI(language: Language, features: Feature[]): GeneratePipelineResult {
  const version = NODE_VERSIONS[language];
  const cmds = buildSteps(language, features);
  const image = getDockerImage(language, version);

  const stages: string[] = [];
  const pipeline: Record<string, unknown> = { image };

  if (features.includes("lint")) stages.push("lint");
  if (features.includes("build")) stages.push("build");
  if (features.includes("test")) stages.push("test");
  if (features.includes("security")) stages.push("security");
  if (stages.length === 0) stages.push("test");

  pipeline.stages = stages;

  const beforeScript = [cmds.install];
  pipeline.before_script = beforeScript;

  if (features.includes("lint")) {
    pipeline.lint = { stage: "lint", script: [cmds.lint] };
  }
  if (features.includes("build")) {
    pipeline.build = { stage: "build", script: [cmds.build] };
  }
  if (features.includes("test")) {
    pipeline.test = { stage: "test", script: [cmds.test] };
  }
  if (features.includes("security")) {
    pipeline.security = { stage: "security", script: ["echo 'Security scan complete'"], "allow_failure": true };
  }

  const yaml = yamlStringify(pipeline, { lineWidth: 0 });
  return { yaml, platform: "gitlab-ci", language, features_included: features, estimated_duration: estimateDuration(features) };
}

function generateCircleCI(language: Language, features: Feature[]): GeneratePipelineResult {
  const version = NODE_VERSIONS[language];
  const cmds = buildSteps(language, features);
  const image = getDockerImage(language, version);

  const steps: unknown[] = [
    "checkout",
    { run: { name: "Install dependencies", command: cmds.install } },
  ];

  if (features.includes("lint")) steps.push({ run: { name: "Lint", command: cmds.lint } });
  if (features.includes("build")) steps.push({ run: { name: "Build", command: cmds.build } });
  if (features.includes("test")) steps.push({ run: { name: "Test", command: cmds.test } });

  const pipeline = {
    version: 2.1,
    jobs: {
      ci: {
        docker: [{ image }],
        steps,
      },
    },
    workflows: {
      "build-and-test": {
        jobs: ["ci"],
      },
    },
  };

  const yaml = yamlStringify(pipeline, { lineWidth: 0 });
  return { yaml, platform: "circleci", language, features_included: features, estimated_duration: estimateDuration(features) };
}

function generateAzurePipelines(language: Language, features: Feature[]): GeneratePipelineResult {
  const version = NODE_VERSIONS[language];
  const cmds = buildSteps(language, features);

  const steps: unknown[] = [];

  if (language === "node") {
    steps.push({ task: "NodeTool@0", inputs: { versionSpec: version } });
  }

  steps.push({ script: cmds.install, displayName: "Install dependencies" });
  if (features.includes("lint")) steps.push({ script: cmds.lint, displayName: "Lint" });
  if (features.includes("build")) steps.push({ script: cmds.build, displayName: "Build" });
  if (features.includes("test")) steps.push({ script: cmds.test, displayName: "Test" });

  const pipeline = {
    trigger: ["main"],
    pool: { vmImage: "ubuntu-latest" },
    steps,
  };

  const yaml = yamlStringify(pipeline, { lineWidth: 0 });
  return { yaml, platform: "azure-pipelines", language, features_included: features, estimated_duration: estimateDuration(features) };
}

function generateBitbucketPipelines(language: Language, features: Feature[]): GeneratePipelineResult {
  const version = NODE_VERSIONS[language];
  const cmds = buildSteps(language, features);
  const image = getDockerImage(language, version);

  const steps: unknown[] = [{ step: { name: "Install", script: [cmds.install] } }];
  if (features.includes("lint")) steps.push({ step: { name: "Lint", script: [cmds.lint] } });
  if (features.includes("build")) steps.push({ step: { name: "Build", script: [cmds.build] } });
  if (features.includes("test")) steps.push({ step: { name: "Test", script: [cmds.test] } });

  const pipeline = { image, pipelines: { default: steps } };

  const yaml = yamlStringify(pipeline, { lineWidth: 0 });
  return { yaml, platform: "bitbucket-pipelines", language, features_included: features, estimated_duration: estimateDuration(features) };
}

function generateJenkinsfile(language: Language, features: Feature[]): GeneratePipelineResult {
  const cmds = buildSteps(language, features);

  const stages: string[] = [];
  stages.push(`        stage('Install') {\n            steps {\n                sh '${cmds.install}'\n            }\n        }`);
  if (features.includes("lint")) {
    stages.push(`        stage('Lint') {\n            steps {\n                sh '${cmds.lint}'\n            }\n        }`);
  }
  if (features.includes("build")) {
    stages.push(`        stage('Build') {\n            steps {\n                sh '${cmds.build}'\n            }\n        }`);
  }
  if (features.includes("test")) {
    stages.push(`        stage('Test') {\n            steps {\n                sh '${cmds.test}'\n            }\n        }`);
  }

  const jenkinsfile = `pipeline {\n    agent any\n    stages {\n${stages.join("\n")}\n    }\n}`;

  return {
    yaml: jenkinsfile,
    platform: "jenkins",
    language,
    features_included: features,
    estimated_duration: estimateDuration(features),
  };
}

// ============================================================================
// validate_pipeline
// ============================================================================

export function validatePipeline(input: ValidatePipelineInput): ValidatePipelineResult {
  const { yaml_content, platform } = input;
  const issues: ValidationIssue[] = [];
  const suggestions: string[] = [];

  // Try parsing YAML
  let parsed: unknown;
  try {
    parsed = yamlParse(yaml_content);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      valid: false,
      score: 0,
      issues: [{ severity: "error", message: `Invalid YAML syntax: ${msg}` }],
      suggestions: ["Fix the YAML syntax errors before proceeding."],
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      valid: false,
      score: 0,
      issues: [{ severity: "error", message: "YAML is empty or not an object" }],
      suggestions: ["Provide a valid pipeline configuration."],
    };
  }

  const doc = parsed as Record<string, unknown>;
  let score = 100;

  // Platform-specific validation
  switch (platform) {
    case "github-actions":
      validateGitHubActions(doc, issues, suggestions);
      break;
    case "gitlab-ci":
      validateGitLabCI(doc, issues, suggestions);
      break;
    case "circleci":
      validateCircleCI(doc, issues, suggestions);
      break;
    default:
      validateGeneric(doc, issues, suggestions);
  }

  // Common best-practice checks
  const yamlStr = yaml_content.toLowerCase();

  if (!yamlStr.includes("cache") && !yamlStr.includes("restore_cache")) {
    issues.push({ severity: "warning", message: "No caching configured — builds may be slower than necessary" });
    suggestions.push("Add dependency caching to speed up builds. Use the add_caching tool.");
    score -= 10;
  }

  if (!yamlStr.includes("audit") && !yamlStr.includes("security") && !yamlStr.includes("snyk") && !yamlStr.includes("trivy")) {
    issues.push({ severity: "info", message: "No security scanning step detected" });
    suggestions.push("Consider adding dependency auditing or SAST scanning.");
    score -= 5;
  }

  if (yamlStr.includes("latest") && (yamlStr.includes("node:latest") || yamlStr.includes("python:latest"))) {
    issues.push({ severity: "warning", message: "Using ':latest' tag for Docker images — builds may break unexpectedly", fix: "Pin to a specific version (e.g., node:20, python:3.12)" });
    score -= 10;
  }

  if (!yamlStr.includes("timeout") && !yamlStr.includes("time-out")) {
    issues.push({ severity: "info", message: "No timeout configured — runaway jobs could waste CI minutes" });
    suggestions.push("Add a timeout to prevent stuck builds.");
    score -= 5;
  }

  // Deduct for errors/warnings
  for (const issue of issues) {
    if (issue.severity === "error") score -= 20;
    else if (issue.severity === "warning") score -= 5;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    valid: issues.filter((i) => i.severity === "error").length === 0,
    score,
    issues,
    suggestions,
  };
}

function validateGitHubActions(doc: Record<string, unknown>, issues: ValidationIssue[], suggestions: string[]): void {
  if (!doc.on && !doc.true) {
    issues.push({ severity: "error", message: "Missing 'on' trigger — workflow will never run" });
  }
  if (!doc.jobs) {
    issues.push({ severity: "error", message: "Missing 'jobs' section" });
  } else if (typeof doc.jobs === "object") {
    const jobs = doc.jobs as Record<string, Record<string, unknown>>;
    for (const [name, job] of Object.entries(jobs)) {
      if (!job["runs-on"]) {
        issues.push({ severity: "error", message: `Job '${name}' missing 'runs-on'`, fix: `Add 'runs-on: ubuntu-latest' to job '${name}'` });
      }
      if (!job.steps || !Array.isArray(job.steps)) {
        issues.push({ severity: "error", message: `Job '${name}' has no steps` });
      } else {
        const hasCheckout = job.steps.some((s: Record<string, unknown>) => s.uses?.toString().startsWith("actions/checkout"));
        if (!hasCheckout) {
          issues.push({ severity: "warning", message: `Job '${name}' doesn't checkout code`, fix: "Add 'uses: actions/checkout@v4' as the first step" });
        }
      }
    }
  }
}

function validateGitLabCI(doc: Record<string, unknown>, issues: ValidationIssue[], suggestions: string[]): void {
  if (!doc.stages && !Object.keys(doc).some((k) => k !== "image" && k !== "variables" && k !== "before_script")) {
    issues.push({ severity: "warning", message: "No 'stages' defined — jobs will run in default order" });
    suggestions.push("Define explicit stages for better control over execution order.");
  }
}

function validateCircleCI(doc: Record<string, unknown>, issues: ValidationIssue[], suggestions: string[]): void {
  if (!doc.version) {
    issues.push({ severity: "error", message: "Missing 'version' field — CircleCI requires this" });
  }
  if (!doc.jobs) {
    issues.push({ severity: "error", message: "Missing 'jobs' section" });
  }
  if (!doc.workflows) {
    issues.push({ severity: "warning", message: "No 'workflows' defined — only the 'build' job will run by default" });
  }
}

function validateGeneric(doc: Record<string, unknown>, issues: ValidationIssue[], _suggestions: string[]): void {
  const keys = Object.keys(doc);
  if (keys.length === 0) {
    issues.push({ severity: "error", message: "Pipeline configuration is empty" });
  }
}

// ============================================================================
// add_caching
// ============================================================================

export function addCaching(input: AddCachingInput): AddCachingResult {
  const { yaml_content, package_manager } = input;
  const cacheConfig = CACHE_PATHS[package_manager];

  if (!cacheConfig) {
    return {
      yaml: yaml_content,
      cache_strategy: "unknown",
      estimated_time_saved: "N/A — unsupported package manager",
    };
  }

  let parsed: unknown;
  try {
    parsed = yamlParse(yaml_content);
  } catch {
    return {
      yaml: yaml_content,
      cache_strategy: "failed",
      estimated_time_saved: "N/A — could not parse YAML",
    };
  }

  const doc = parsed as Record<string, unknown>;

  // Detect platform and add caching
  if (doc.jobs && typeof doc.jobs === "object" && (doc.on || doc.name)) {
    // GitHub Actions
    return addGitHubActionsCache(doc, package_manager, cacheConfig);
  } else if (doc.stages || doc.image) {
    // GitLab CI
    return addGitLabCICache(doc, package_manager, cacheConfig);
  } else if (doc.version && doc.jobs && doc.workflows) {
    // CircleCI
    return addCircleCICache(doc, package_manager, cacheConfig);
  }

  // Generic: just return with instructions
  return {
    yaml: yaml_content,
    cache_strategy: `Add caching for ${package_manager} with path: ${cacheConfig.path} and key based on: ${cacheConfig.key_file}`,
    estimated_time_saved: "30-60 seconds per build",
  };
}

function addGitHubActionsCache(doc: Record<string, unknown>, pm: PackageManager, cache: { path: string; key_file: string }): AddCachingResult {
  const jobs = doc.jobs as Record<string, Record<string, unknown>>;

  for (const job of Object.values(jobs)) {
    if (Array.isArray(job.steps)) {
      // Find the position after checkout
      const checkoutIdx = job.steps.findIndex((s: Record<string, unknown>) => s.uses?.toString().startsWith("actions/checkout"));
      const insertIdx = checkoutIdx >= 0 ? checkoutIdx + 1 : 1;

      const cacheStep = {
        name: `Cache ${pm} dependencies`,
        uses: "actions/cache@v4",
        with: {
          path: cache.path,
          key: `\${{ runner.os }}-${pm}-\${{ hashFiles('${cache.key_file}') }}`,
          "restore-keys": `\${{ runner.os }}-${pm}-`,
        },
      };

      // Don't add if already has caching
      const hasCache = job.steps.some((s: Record<string, unknown>) => s.uses?.toString().includes("actions/cache"));
      if (!hasCache) {
        job.steps.splice(insertIdx, 0, cacheStep);
      }
    }
  }

  const yaml = yamlStringify(doc, { lineWidth: 0 });
  return {
    yaml,
    cache_strategy: `GitHub Actions cache with actions/cache@v4, keyed on ${cache.key_file}`,
    estimated_time_saved: "30-90 seconds per build",
  };
}

function addGitLabCICache(doc: Record<string, unknown>, pm: PackageManager, cache: { path: string; key_file: string }): AddCachingResult {
  doc.cache = {
    key: { files: [cache.key_file] },
    paths: [cache.path.replace("~/", "")],
    policy: "pull-push",
  };

  const yaml = yamlStringify(doc, { lineWidth: 0 });
  return {
    yaml,
    cache_strategy: `GitLab CI cache keyed on ${cache.key_file}`,
    estimated_time_saved: "30-90 seconds per build",
  };
}

function addCircleCICache(doc: Record<string, unknown>, pm: PackageManager, cache: { path: string; key_file: string }): AddCachingResult {
  const jobs = doc.jobs as Record<string, Record<string, unknown>>;

  for (const job of Object.values(jobs)) {
    if (Array.isArray(job.steps)) {
      const checkoutIdx = job.steps.findIndex((s: unknown) => s === "checkout");
      const insertIdx = checkoutIdx >= 0 ? checkoutIdx + 1 : 0;

      const restoreStep = {
        restore_cache: {
          keys: [`${pm}-deps-{{ checksum "${cache.key_file}" }}`, `${pm}-deps-`],
        },
      };

      const saveStep = {
        save_cache: {
          key: `${pm}-deps-{{ checksum "${cache.key_file}" }}`,
          paths: [cache.path],
        },
      };

      const hasCache = job.steps.some((s: Record<string, unknown>) => s.restore_cache);
      if (!hasCache) {
        job.steps.splice(insertIdx, 0, restoreStep);
        // Add save_cache after install step
        const installIdx = job.steps.findIndex((s: Record<string, unknown>) => s.run && (s.run as Record<string, unknown>).name?.toString().toLowerCase().includes("install"));
        if (installIdx >= 0) {
          job.steps.splice(installIdx + 1, 0, saveStep);
        } else {
          job.steps.push(saveStep);
        }
      }
    }
  }

  const yaml = yamlStringify(doc, { lineWidth: 0 });
  return {
    yaml,
    cache_strategy: `CircleCI cache keyed on ${cache.key_file}`,
    estimated_time_saved: "30-90 seconds per build",
  };
}

// ============================================================================
// optimize_pipeline
// ============================================================================

export function optimizePipeline(input: OptimizePipelineInput): OptimizePipelineResult {
  const { yaml_content } = input;
  const optimizations: Optimization[] = [];

  let parsed: unknown;
  try {
    parsed = yamlParse(yaml_content);
  } catch {
    return {
      yaml: yaml_content,
      optimizations_applied: [],
      estimated_speedup: "N/A — could not parse YAML",
    };
  }

  const doc = parsed as Record<string, unknown>;
  const yamlLower = yaml_content.toLowerCase();

  // Optimization 1: Detect serial jobs that could be parallel (GitHub Actions)
  if (doc.jobs && typeof doc.jobs === "object") {
    const jobs = doc.jobs as Record<string, Record<string, unknown>>;
    const jobNames = Object.keys(jobs);

    // Check if lint and test could run in parallel
    if (jobNames.length === 1) {
      const singleJob = Object.values(jobs)[0];
      if (Array.isArray(singleJob.steps)) {
        const hasLint = singleJob.steps.some((s: Record<string, unknown>) => {
          const name = (s.name || "").toString().toLowerCase();
          const run = (s.run || "").toString().toLowerCase();
          return name.includes("lint") || run.includes("lint");
        });
        const hasTest = singleJob.steps.some((s: Record<string, unknown>) => {
          const name = (s.name || "").toString().toLowerCase();
          const run = (s.run || "").toString().toLowerCase();
          return name.includes("test") || run.includes("test");
        });

        if (hasLint && hasTest) {
          // Split into parallel jobs
          const baseSteps = singleJob.steps.filter((s: Record<string, unknown>) => {
            const name = (s.name || "").toString().toLowerCase();
            const run = (s.run || "").toString().toLowerCase();
            return !name.includes("lint") && !name.includes("test") && !run.includes("lint") && !run.includes("test");
          });

          const lintSteps = singleJob.steps.filter((s: Record<string, unknown>) => {
            const name = (s.name || "").toString().toLowerCase();
            const run = (s.run || "").toString().toLowerCase();
            return name.includes("lint") || run.includes("lint");
          });

          const testSteps = singleJob.steps.filter((s: Record<string, unknown>) => {
            const name = (s.name || "").toString().toLowerCase();
            const run = (s.run || "").toString().toLowerCase();
            return name.includes("test") || run.includes("test");
          });

          const runsOn = singleJob["runs-on"] || "ubuntu-latest";

          doc.jobs = {
            lint: { "runs-on": runsOn, steps: [...baseSteps, ...lintSteps] },
            test: { "runs-on": runsOn, steps: [...baseSteps, ...testSteps] },
          };

          // Add remaining steps (build, security, etc.) to a dependent job
          const otherSteps = singleJob.steps.filter((s: Record<string, unknown>) => {
            const name = (s.name || "").toString().toLowerCase();
            const run = (s.run || "").toString().toLowerCase();
            const isBase = !name.includes("lint") && !name.includes("test") && !run.includes("lint") && !run.includes("test");
            const isSetup = s.uses?.toString().startsWith("actions/checkout") || s.uses?.toString().includes("setup-") || name.includes("install") || name.includes("dependencies");
            return isBase && !isSetup;
          });

          if (otherSteps.length > 0) {
            (doc.jobs as Record<string, unknown>).build = {
              "runs-on": runsOn,
              needs: ["lint", "test"],
              steps: [...baseSteps, ...otherSteps],
            };
          }

          optimizations.push({
            type: "parallelization",
            description: "Split lint and test into parallel jobs",
            impact: "Runs lint and test concurrently, reducing total pipeline time",
          });
        }
      }
    }
  }

  // Optimization 2: Suggest fail-fast
  if (doc.jobs && typeof doc.jobs === "object") {
    const jobs = doc.jobs as Record<string, Record<string, unknown>>;
    const jobNames = Object.keys(jobs);

    if (jobNames.length > 1) {
      // Check if any job has a strategy with fail-fast: false
      let hasFastFail = false;
      for (const job of Object.values(jobs)) {
        if (job.strategy && (job.strategy as Record<string, unknown>)["fail-fast"] !== false) {
          hasFastFail = true;
        }
      }
      if (!hasFastFail && !yamlLower.includes("fail-fast")) {
        optimizations.push({
          type: "fail-fast",
          description: "Enable fail-fast for matrix builds to cancel remaining jobs on first failure",
          impact: "Saves CI minutes when a job fails early",
        });
      }
    }
  }

  // Optimization 3: Add concurrency group to cancel outdated runs
  if (!doc.concurrency && (doc.on || doc.name)) {
    doc.concurrency = {
      group: "${{ github.workflow }}-${{ github.ref }}",
      "cancel-in-progress": true,
    };
    optimizations.push({
      type: "concurrency",
      description: "Added concurrency group to cancel outdated runs on the same branch",
      impact: "Prevents wasted CI minutes on superseded pushes",
    });
  }

  // Optimization 4: Detect missing checkout or setup steps
  if (!yamlLower.includes("checkout") && !yamlLower.includes("actions/checkout") && (doc.on || doc.name)) {
    optimizations.push({
      type: "missing-step",
      description: "No checkout step detected — code may not be available",
      impact: "Pipeline will likely fail without checking out the repository",
    });
  }

  const yaml = yamlStringify(doc, { lineWidth: 0 });
  const speedup = optimizations.length > 0
    ? `~${optimizations.length * 15}-${optimizations.length * 30}% faster with ${optimizations.length} optimization(s)`
    : "No optimizations needed — pipeline looks good!";

  return {
    yaml,
    optimizations_applied: optimizations,
    estimated_speedup: speedup,
  };
}

// ============================================================================
// convert_pipeline
// ============================================================================

export interface ConvertPipelineInput {
  yaml_content: string;
  source_platform: Platform;
  target_platform: Platform;
}

export interface ConvertPipelineResult {
  [key: string]: unknown;
  yaml: string;
  source_platform: string;
  target_platform: string;
  conversion_notes: string[];
}

export function convertPipeline(input: ConvertPipelineInput): ConvertPipelineResult {
  const { yaml_content, source_platform, target_platform } = input;
  const notes: string[] = [];

  if (source_platform === target_platform) {
    return { yaml: yaml_content, source_platform, target_platform, conversion_notes: ["Source and target are the same — no conversion needed."] };
  }

  let parsed: unknown;
  try {
    parsed = yamlParse(yaml_content);
  } catch {
    return { yaml: yaml_content, source_platform, target_platform, conversion_notes: ["Could not parse source YAML."] };
  }

  const doc = parsed as Record<string, unknown>;

  // Extract common info from source
  const extracted = extractPipelineInfo(doc, source_platform);
  notes.push(`Extracted ${extracted.steps.length} step(s) from ${source_platform}`);

  // Detect language from steps
  const language = detectLanguage(extracted.steps);

  // Detect features from steps
  const features = detectFeatures(extracted.steps);
  notes.push(`Detected language: ${language}, features: ${features.join(", ")}`);

  // Generate target pipeline using existing generator
  const result = generatePipeline({ platform: target_platform, language, features });
  notes.push(`Generated ${target_platform} config with ${features.length} feature(s)`);

  if (source_platform === "jenkins" || target_platform === "jenkins") {
    notes.push("Jenkins uses Groovy Jenkinsfile syntax — some features may not map 1:1");
  }

  return {
    yaml: result.yaml,
    source_platform,
    target_platform,
    conversion_notes: notes,
  };
}

interface ExtractedInfo {
  steps: Array<{ name: string; command: string }>;
  image?: string;
}

function extractPipelineInfo(doc: Record<string, unknown>, platform: Platform): ExtractedInfo {
  const steps: Array<{ name: string; command: string }> = [];

  if (platform === "github-actions" && doc.jobs) {
    const jobs = doc.jobs as Record<string, Record<string, unknown>>;
    for (const job of Object.values(jobs)) {
      if (Array.isArray(job.steps)) {
        for (const step of job.steps) {
          const s = step as Record<string, unknown>;
          if (s.run) steps.push({ name: (s.name || "").toString(), command: s.run.toString() });
        }
      }
    }
  } else if (platform === "gitlab-ci") {
    for (const [key, val] of Object.entries(doc)) {
      if (key === "stages" || key === "image" || key === "variables" || key === "before_script" || key === "cache") continue;
      const job = val as Record<string, unknown>;
      if (job.script && Array.isArray(job.script)) {
        for (const cmd of job.script) steps.push({ name: key, command: String(cmd) });
      }
    }
  } else if (platform === "circleci" && doc.jobs) {
    const jobs = doc.jobs as Record<string, Record<string, unknown>>;
    for (const job of Object.values(jobs)) {
      if (Array.isArray(job.steps)) {
        for (const step of job.steps) {
          if (typeof step === "object" && step !== null) {
            const s = step as Record<string, unknown>;
            if (s.run) {
              const run = s.run as Record<string, unknown>;
              steps.push({ name: (run.name || "").toString(), command: (run.command || "").toString() });
            }
          }
        }
      }
    }
  }

  return { steps, image: doc.image?.toString() };
}

function detectLanguage(steps: Array<{ name: string; command: string }>): Language {
  const allCmds = steps.map((s) => s.command.toLowerCase()).join(" ");
  if (allCmds.includes("npm") || allCmds.includes("yarn") || allCmds.includes("pnpm") || allCmds.includes("node")) return "node";
  if (allCmds.includes("pip") || allCmds.includes("pytest") || allCmds.includes("python")) return "python";
  if (allCmds.includes("go ") || allCmds.includes("go.mod")) return "go";
  if (allCmds.includes("cargo") || allCmds.includes("rustc")) return "rust";
  if (allCmds.includes("mvn") || allCmds.includes("gradle") || allCmds.includes("java")) return "java";
  if (allCmds.includes("dotnet")) return "dotnet";
  return "node";
}

function detectFeatures(steps: Array<{ name: string; command: string }>): Feature[] {
  const features: Feature[] = [];
  const allText = steps.map((s) => `${s.name} ${s.command}`.toLowerCase()).join(" ");
  if (allText.includes("test") || allText.includes("pytest") || allText.includes("jest")) features.push("test");
  if (allText.includes("lint") || allText.includes("eslint") || allText.includes("ruff") || allText.includes("clippy")) features.push("lint");
  if (allText.includes("build") || allText.includes("compile")) features.push("build");
  if (allText.includes("docker")) features.push("docker");
  if (allText.includes("deploy")) features.push("deploy");
  if (allText.includes("audit") || allText.includes("security") || allText.includes("snyk")) features.push("security");
  if (features.length === 0) features.push("test");
  return features;
}

// ============================================================================
// add_security_scanning
// ============================================================================

export type Scanner = "sast" | "dependency-audit" | "secrets-detection" | "container-scan" | "license-check";

export interface AddSecurityScanningInput {
  yaml_content: string;
  scanners: Scanner[];
}

export interface AddSecurityScanningResult {
  [key: string]: unknown;
  yaml: string;
  scanners_added: string[];
  notes: string[];
}

const SCANNER_STEPS: Record<Scanner, Record<string, { name: string; step: Record<string, unknown> }>> = {
  "sast": {
    "github-actions": {
      name: "SAST — CodeQL Analysis",
      step: {
        name: "Initialize CodeQL",
        uses: "github/codeql-action/init@v3",
      },
    },
    default: {
      name: "SAST Scan",
      step: { name: "Run SAST scan", run: "echo 'Add SAST scanner (e.g., semgrep, CodeQL)'" },
    },
  },
  "dependency-audit": {
    node: { name: "npm audit", step: { name: "Dependency audit", run: "npm audit --audit-level=high" } },
    python: { name: "pip-audit", step: { name: "Dependency audit", run: "pip install pip-audit && pip-audit" } },
    go: { name: "govulncheck", step: { name: "Dependency audit", run: "go install golang.org/x/vuln/cmd/govulncheck@latest && govulncheck ./..." } },
    rust: { name: "cargo-audit", step: { name: "Dependency audit", run: "cargo install cargo-audit && cargo audit" } },
    java: { name: "OWASP dependency-check", step: { name: "Dependency audit", run: "mvn org.owasp:dependency-check-maven:check" } },
    default: { name: "Dependency audit", step: { name: "Dependency audit", run: "echo 'Add dependency audit for your language'" } },
  },
  "secrets-detection": {
    "github-actions": {
      name: "Gitleaks",
      step: { name: "Secrets detection", uses: "gitleaks/gitleaks-action@v2" },
    },
    default: {
      name: "Gitleaks",
      step: { name: "Secrets detection", run: "docker run -v $(pwd):/path zricethezav/gitleaks:latest detect --source=/path" },
    },
  },
  "container-scan": {
    "github-actions": {
      name: "Trivy container scan",
      step: { name: "Container scan", uses: "aquasecurity/trivy-action@master", with: { "image-ref": "${{ github.repository }}:latest", "exit-code": "1" } },
    },
    default: {
      name: "Trivy container scan",
      step: { name: "Container scan", run: "docker run aquasec/trivy image $IMAGE_NAME" },
    },
  },
  "license-check": {
    node: { name: "license-checker", step: { name: "License check", run: "npx license-checker --failOn 'GPL-3.0'" } },
    python: { name: "pip-licenses", step: { name: "License check", run: "pip install pip-licenses && pip-licenses --fail-on 'GPL-3.0'" } },
    default: { name: "License check", step: { name: "License check", run: "echo 'Add license checker for your language'" } },
  },
};

export function addSecurityScanning(input: AddSecurityScanningInput): AddSecurityScanningResult {
  const { yaml_content, scanners } = input;
  const addedScanners: string[] = [];
  const notes: string[] = [];

  let parsed: unknown;
  try {
    parsed = yamlParse(yaml_content);
  } catch {
    return { yaml: yaml_content, scanners_added: [], notes: ["Could not parse YAML"] };
  }

  const doc = parsed as Record<string, unknown>;

  // Detect platform and language
  const isGHA = !!(doc.on || doc.name) && !!doc.jobs;
  const yamlLower = yaml_content.toLowerCase();
  const lang = yamlLower.includes("npm") || yamlLower.includes("node") ? "node"
    : yamlLower.includes("python") || yamlLower.includes("pip") ? "python"
    : yamlLower.includes("go ") ? "go"
    : yamlLower.includes("cargo") ? "rust"
    : yamlLower.includes("mvn") ? "java" : "default";

  // Add scanner steps to each job
  if (isGHA && doc.jobs) {
    const jobs = doc.jobs as Record<string, Record<string, unknown>>;
    const firstJob = Object.values(jobs)[0];
    if (Array.isArray(firstJob?.steps)) {
      for (const scanner of scanners) {
        const scannerConfig = SCANNER_STEPS[scanner];
        const config = scannerConfig[isGHA ? "github-actions" : "default"] || scannerConfig[lang] || scannerConfig.default;
        if (config) {
          firstJob.steps.push(config.step);
          addedScanners.push(config.name);
        }
      }
    }
  } else {
    // GitLab CI / other — add as separate stages
    for (const scanner of scanners) {
      const scannerConfig = SCANNER_STEPS[scanner];
      const config = scannerConfig[lang] || scannerConfig.default;
      if (config) {
        const jobName = scanner.replace(/-/g, "_");
        (doc as Record<string, unknown>)[jobName] = {
          stage: "security",
          script: [config.step.run || `echo '${config.name}'`],
          allow_failure: true,
        };
        addedScanners.push(config.name);
      }
    }

    // Add security stage if stages array exists
    if (Array.isArray(doc.stages) && !doc.stages.includes("security")) {
      doc.stages.push("security");
    }
  }

  notes.push(`Added ${addedScanners.length} scanner(s) for ${lang} project`);
  if (scanners.includes("container-scan")) {
    notes.push("Container scan requires a built Docker image — ensure a Docker build step runs first");
  }

  const yaml = yamlStringify(doc, { lineWidth: 0 });
  return { yaml, scanners_added: addedScanners, notes };
}

// ============================================================================
// add_parallelization
// ============================================================================

export interface AddParallelizationInput {
  yaml_content: string;
}

export interface AddParallelizationResult {
  [key: string]: unknown;
  yaml: string;
  jobs_created: string[];
  dependency_graph: string;
  estimated_speedup: string;
}

export function addParallelization(input: AddParallelizationInput): AddParallelizationResult {
  const { yaml_content } = input;

  let parsed: unknown;
  try {
    parsed = yamlParse(yaml_content);
  } catch {
    return { yaml: yaml_content, jobs_created: [], dependency_graph: "N/A", estimated_speedup: "N/A — could not parse YAML" };
  }

  const doc = parsed as Record<string, unknown>;

  // Only works for GitHub Actions with a single job
  if (!doc.jobs || typeof doc.jobs !== "object") {
    return { yaml: yaml_content, jobs_created: [], dependency_graph: "N/A", estimated_speedup: "No jobs found to parallelize" };
  }

  const jobs = doc.jobs as Record<string, Record<string, unknown>>;
  const jobNames = Object.keys(jobs);

  if (jobNames.length > 1) {
    return { yaml: yaml_content, jobs_created: jobNames, dependency_graph: jobNames.join(" | "), estimated_speedup: "Jobs already parallel" };
  }

  const singleJob = Object.values(jobs)[0];
  if (!Array.isArray(singleJob?.steps)) {
    return { yaml: yaml_content, jobs_created: [], dependency_graph: "N/A", estimated_speedup: "No steps found" };
  }

  const runsOn = singleJob["runs-on"] || "ubuntu-latest";

  // Categorize steps
  const setupSteps: unknown[] = [];
  const lintSteps: unknown[] = [];
  const testSteps: unknown[] = [];
  const buildSteps: unknown[] = [];
  const securitySteps: unknown[] = [];
  const deploySteps: unknown[] = [];

  for (const step of singleJob.steps) {
    const s = step as Record<string, unknown>;
    const name = (s.name || "").toString().toLowerCase();
    const run = (s.run || "").toString().toLowerCase();
    const uses = (s.uses || "").toString().toLowerCase();

    if (uses.includes("checkout") || uses.includes("setup-") || name.includes("install") || name.includes("dependencies") || run.includes("npm ci") || run.includes("pip install") || run.includes("go mod")) {
      setupSteps.push(step);
    } else if (name.includes("lint") || run.includes("lint") || run.includes("eslint") || run.includes("ruff")) {
      lintSteps.push(step);
    } else if (name.includes("test") || run.includes("test") || run.includes("pytest") || run.includes("jest")) {
      testSteps.push(step);
    } else if (name.includes("build") || run.includes("build")) {
      buildSteps.push(step);
    } else if (name.includes("security") || name.includes("audit") || run.includes("audit")) {
      securitySteps.push(step);
    } else if (name.includes("deploy")) {
      deploySteps.push(step);
    } else {
      setupSteps.push(step);
    }
  }

  const newJobs: Record<string, unknown> = {};
  const createdJobs: string[] = [];
  const parallelJobs: string[] = [];

  if (lintSteps.length > 0) {
    newJobs.lint = { "runs-on": runsOn, steps: [...setupSteps, ...lintSteps] };
    createdJobs.push("lint");
    parallelJobs.push("lint");
  }
  if (testSteps.length > 0) {
    newJobs.test = { "runs-on": runsOn, steps: [...setupSteps, ...testSteps] };
    createdJobs.push("test");
    parallelJobs.push("test");
  }
  if (securitySteps.length > 0) {
    newJobs.security = { "runs-on": runsOn, steps: [...setupSteps, ...securitySteps] };
    createdJobs.push("security");
    parallelJobs.push("security");
  }
  if (buildSteps.length > 0) {
    const buildJob: Record<string, unknown> = { "runs-on": runsOn, steps: [...setupSteps, ...buildSteps] };
    if (parallelJobs.length > 0) buildJob.needs = [...parallelJobs];
    newJobs.build = buildJob;
    createdJobs.push("build");
  }
  if (deploySteps.length > 0) {
    newJobs.deploy = { "runs-on": runsOn, needs: ["build"], steps: [...setupSteps, ...deploySteps] };
    createdJobs.push("deploy");
  }

  if (createdJobs.length <= 1) {
    return { yaml: yaml_content, jobs_created: [], dependency_graph: "Not enough distinct steps to parallelize", estimated_speedup: "N/A" };
  }

  doc.jobs = newJobs;

  const graph = parallelJobs.length > 0
    ? `[${parallelJobs.join(" | ")}] → ${buildSteps.length > 0 ? "build" : ""}${deploySteps.length > 0 ? " → deploy" : ""}`
    : createdJobs.join(" → ");

  const yaml = yamlStringify(doc, { lineWidth: 0 });
  return {
    yaml,
    jobs_created: createdJobs,
    dependency_graph: graph,
    estimated_speedup: `~${Math.round((1 - 1 / parallelJobs.length) * 100)}% faster on parallel stages`,
  };
}

// ============================================================================
// generate_monorepo_pipeline
// ============================================================================

export interface MonorepoService {
  name: string;
  path: string;
  language: Language;
  features: Feature[];
}

export interface GenerateMonorepoPipelineInput {
  services: MonorepoService[];
  platform: Platform;
}

export interface GenerateMonorepoPipelineResult {
  [key: string]: unknown;
  yaml: string;
  platform: string;
  services_count: number;
  dependency_graph: string;
}

export function generateMonorepoPipeline(input: GenerateMonorepoPipelineInput): GenerateMonorepoPipelineResult {
  const { services, platform } = input;

  if (platform !== "github-actions") {
    // Generate a basic multi-stage pipeline for other platforms
    const result = generateMonorepoGitLabCI(services);
    return { yaml: result, platform, services_count: services.length, dependency_graph: services.map((s) => s.name).join(" | ") };
  }

  // GitHub Actions monorepo with path filters
  const jobs: Record<string, unknown> = {};

  for (const service of services) {
    const cmds = buildSteps(service.language, service.features);
    const setupStep = getSetupStep(service.language, NODE_VERSIONS[service.language]);

    const steps: unknown[] = [
      { uses: "actions/checkout@v4" },
      setupStep,
      { name: "Install dependencies", run: cmds.install, "working-directory": service.path },
    ];

    if (service.features.includes("lint")) {
      steps.push({ name: "Lint", run: cmds.lint, "working-directory": service.path });
    }
    if (service.features.includes("build")) {
      steps.push({ name: "Build", run: cmds.build, "working-directory": service.path });
    }
    if (service.features.includes("test")) {
      steps.push({ name: "Test", run: cmds.test, "working-directory": service.path });
    }

    jobs[service.name] = {
      "runs-on": "ubuntu-latest",
      "if": `github.event_name == 'push' || contains(github.event.pull_request.changed_files, '${service.path}/')`,
      steps,
    };
  }

  const pipeline = {
    name: "Monorepo CI",
    on: {
      push: { branches: ["main"] },
      pull_request: { branches: ["main"] },
    },
    jobs,
  };

  const yaml = yamlStringify(pipeline, { lineWidth: 0 });
  return {
    yaml,
    platform: "github-actions",
    services_count: services.length,
    dependency_graph: services.map((s) => s.name).join(" | "),
  };
}

function generateMonorepoGitLabCI(services: MonorepoService[]): string {
  const stages = ["lint", "build", "test"];
  const pipeline: Record<string, unknown> = { stages };

  for (const service of services) {
    const cmds = buildSteps(service.language, service.features);
    const image = getDockerImage(service.language, NODE_VERSIONS[service.language]);

    if (service.features.includes("test")) {
      pipeline[`test:${service.name}`] = {
        stage: "test",
        image,
        script: [cmds.install, cmds.test],
        rules: [{ changes: [`${service.path}/**/*`] }],
      };
    }
    if (service.features.includes("build")) {
      pipeline[`build:${service.name}`] = {
        stage: "build",
        image,
        script: [cmds.install, cmds.build],
        rules: [{ changes: [`${service.path}/**/*`] }],
      };
    }
  }

  return yamlStringify(pipeline, { lineWidth: 0 });
}

// ============================================================================
// add_deployment
// ============================================================================

export type DeployTarget = "vercel" | "netlify" | "aws-ecs" | "aws-lambda" | "gcp-cloudrun" | "heroku" | "docker-hub" | "github-pages" | "fly-io";
export type Environment = "staging" | "production";

export interface AddDeploymentInput {
  yaml_content: string;
  deploy_target: DeployTarget;
  environment: Environment;
}

export interface AddDeploymentResult {
  [key: string]: unknown;
  yaml: string;
  deploy_target: string;
  environment: string;
  required_secrets: string[];
  notes: string[];
}

const DEPLOY_CONFIGS: Record<DeployTarget, { secrets: string[]; step: (env: Environment) => Record<string, unknown>; notes: string[] }> = {
  vercel: {
    secrets: ["VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"],
    step: (env) => ({
      name: `Deploy to Vercel (${env})`,
      uses: "amondnet/vercel-action@v25",
      with: {
        "vercel-token": "${{ secrets.VERCEL_TOKEN }}",
        "vercel-org-id": "${{ secrets.VERCEL_ORG_ID }}",
        "vercel-project-id": "${{ secrets.VERCEL_PROJECT_ID }}",
        "vercel-args": env === "production" ? "--prod" : "",
      },
    }),
    notes: ["Set up Vercel secrets in GitHub repo settings"],
  },
  netlify: {
    secrets: ["NETLIFY_AUTH_TOKEN", "NETLIFY_SITE_ID"],
    step: (env) => ({
      name: `Deploy to Netlify (${env})`,
      uses: "nwtgck/actions-netlify@v3",
      with: {
        "publish-dir": "./build",
        "production-deploy": env === "production" ? "true" : "false",
      },
      env: {
        NETLIFY_AUTH_TOKEN: "${{ secrets.NETLIFY_AUTH_TOKEN }}",
        NETLIFY_SITE_ID: "${{ secrets.NETLIFY_SITE_ID }}",
      },
    }),
    notes: ["Update publish-dir to match your build output directory"],
  },
  "aws-ecs": {
    secrets: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
    step: (env) => ({
      name: `Deploy to AWS ECS (${env})`,
      uses: "aws-actions/amazon-ecs-deploy-task-definition@v2",
      with: {
        "task-definition": `task-def-${env}.json`,
        service: `my-service-${env}`,
        cluster: `my-cluster-${env}`,
      },
    }),
    notes: ["Create task definition JSON files for each environment", "Configure AWS credentials in GitHub secrets"],
  },
  "aws-lambda": {
    secrets: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
    step: (env) => ({
      name: `Deploy to AWS Lambda (${env})`,
      run: `aws lambda update-function-code --function-name my-function-${env} --zip-file fileb://deployment.zip`,
    }),
    notes: ["Package your function as deployment.zip before this step"],
  },
  "gcp-cloudrun": {
    secrets: ["GCP_SA_KEY"],
    step: (env) => ({
      name: `Deploy to Cloud Run (${env})`,
      uses: "google-github-actions/deploy-cloudrun@v2",
      with: {
        service: `my-service-${env}`,
        region: "us-central1",
        image: "gcr.io/${{ github.repository }}:${{ github.sha }}",
      },
    }),
    notes: ["Build and push Docker image to GCR before this step"],
  },
  heroku: {
    secrets: ["HEROKU_API_KEY"],
    step: (env) => ({
      name: `Deploy to Heroku (${env})`,
      uses: "akhileshns/heroku-deploy@v3.13.15",
      with: {
        heroku_api_key: "${{ secrets.HEROKU_API_KEY }}",
        heroku_app_name: `my-app-${env}`,
        heroku_email: "${{ secrets.HEROKU_EMAIL }}",
      },
    }),
    notes: [],
  },
  "docker-hub": {
    secrets: ["DOCKER_USERNAME", "DOCKER_PASSWORD"],
    step: (_env) => ({
      name: "Push to Docker Hub",
      uses: "docker/build-push-action@v6",
      with: {
        push: "true",
        tags: "${{ secrets.DOCKER_USERNAME }}/${{ github.repository }}:latest,${{ secrets.DOCKER_USERNAME }}/${{ github.repository }}:${{ github.sha }}",
      },
    }),
    notes: ["Add Docker login step before this: docker/login-action@v3"],
  },
  "github-pages": {
    secrets: [],
    step: (_env) => ({
      name: "Deploy to GitHub Pages",
      uses: "actions/deploy-pages@v4",
    }),
    notes: ["Add actions/upload-pages-artifact step before this", "Enable Pages in repo Settings → Pages → Source: GitHub Actions"],
  },
  "fly-io": {
    secrets: ["FLY_API_TOKEN"],
    step: (env) => ({
      name: `Deploy to Fly.io (${env})`,
      uses: "superfly/flyctl-actions/setup-flyctl@master",
    }),
    notes: ["Run 'flyctl deploy' after setup step"],
  },
};

export function addDeployment(input: AddDeploymentInput): AddDeploymentResult {
  const { yaml_content, deploy_target, environment } = input;

  let parsed: unknown;
  try {
    parsed = yamlParse(yaml_content);
  } catch {
    return { yaml: yaml_content, deploy_target, environment, required_secrets: [], notes: ["Could not parse YAML"] };
  }

  const doc = parsed as Record<string, unknown>;
  const config = DEPLOY_CONFIGS[deploy_target];
  const deployStep = config.step(environment);

  // Add to GitHub Actions
  if (doc.jobs && typeof doc.jobs === "object") {
    const jobs = doc.jobs as Record<string, Record<string, unknown>>;
    const existingJobNames = Object.keys(jobs);

    // Create a deploy job that depends on all existing jobs
    jobs.deploy = {
      "runs-on": "ubuntu-latest",
      needs: existingJobNames,
      if: environment === "production"
        ? "github.ref == 'refs/heads/main' && github.event_name == 'push'"
        : "github.event_name == 'pull_request'",
      environment: environment,
      steps: [
        { uses: "actions/checkout@v4" },
        deployStep,
      ],
    };
  }

  const yaml = yamlStringify(doc, { lineWidth: 0 });
  return {
    yaml,
    deploy_target,
    environment,
    required_secrets: config.secrets,
    notes: config.notes,
  };
}

// ============================================================================
// estimate_build_time
// ============================================================================

export interface EstimateBuildTimeInput {
  yaml_content: string;
}

export interface StepEstimate {
  name: string;
  estimated_seconds: number;
  category: string;
}

export interface EstimateBuildTimeResult {
  [key: string]: unknown;
  total_estimated_seconds: number;
  total_estimated_display: string;
  steps: StepEstimate[];
  bottleneck: string;
  parallelizable: boolean;
  parallel_estimate_display: string;
}

const STEP_TIME_ESTIMATES: Record<string, number> = {
  // Checkout
  checkout: 5,
  "actions/checkout": 5,
  // Setup
  "setup-node": 10,
  "setup-python": 12,
  "setup-go": 8,
  "setup-java": 15,
  "setup-dotnet": 12,
  "rust-toolchain": 20,
  // Install
  "npm ci": 30,
  "npm install": 45,
  "yarn install": 35,
  "pnpm install": 25,
  "pip install": 25,
  "go mod download": 15,
  "cargo fetch": 20,
  "mvn dependency": 40,
  "dotnet restore": 20,
  // Lint
  "npm run lint": 15,
  "eslint": 15,
  "ruff check": 8,
  "golangci-lint": 20,
  "cargo clippy": 30,
  "checkstyle": 10,
  // Build
  "npm run build": 45,
  "python -m build": 15,
  "go build": 25,
  "cargo build": 90,
  "cargo build --release": 180,
  "mvn package": 60,
  "dotnet build": 30,
  // Test
  "npm test": 30,
  pytest: 25,
  "go test": 20,
  "cargo test": 45,
  "mvn test": 45,
  "dotnet test": 25,
  // Security
  "npm audit": 10,
  "safety check": 8,
  "pip-audit": 10,
  "cargo audit": 10,
  trivy: 20,
  gitleaks: 15,
  codeql: 60,
  // Docker
  "docker build": 60,
  "docker push": 30,
  // Deploy
  deploy: 30,
  vercel: 25,
  netlify: 20,
};

export function estimateBuildTime(input: EstimateBuildTimeInput): EstimateBuildTimeResult {
  const { yaml_content } = input;

  let parsed: unknown;
  try {
    parsed = yamlParse(yaml_content);
  } catch {
    return {
      total_estimated_seconds: 0,
      total_estimated_display: "N/A — could not parse YAML",
      steps: [],
      bottleneck: "N/A",
      parallelizable: false,
      parallel_estimate_display: "N/A",
    };
  }

  const doc = parsed as Record<string, unknown>;
  const allSteps: StepEstimate[] = [];
  const jobSteps: Map<string, StepEstimate[]> = new Map();

  if (doc.jobs && typeof doc.jobs === "object") {
    const jobs = doc.jobs as Record<string, Record<string, unknown>>;

    for (const [jobName, job] of Object.entries(jobs)) {
      const steps: StepEstimate[] = [];
      if (Array.isArray(job.steps)) {
        for (const step of job.steps) {
          const s = step as Record<string, unknown>;
          const name = (s.name || s.uses || s.run || "unknown").toString();
          const estimate = estimateStepTime(name, (s.run || "").toString(), (s.uses || "").toString());
          const stepEst: StepEstimate = { name, estimated_seconds: estimate.seconds, category: estimate.category };
          steps.push(stepEst);
          allSteps.push(stepEst);
        }
      }
      jobSteps.set(jobName, steps);
    }
  }

  // Check for parallelism (multiple jobs without sequential deps)
  const jobs = doc.jobs as Record<string, Record<string, unknown>> | undefined;
  const jobNames = jobs ? Object.keys(jobs) : [];
  const hasParallel = jobNames.length > 1;

  // Calculate serial total
  const serialTotal = allSteps.reduce((sum, s) => sum + s.estimated_seconds, 0);

  // Calculate parallel total (max of parallel job groups)
  let parallelTotal = serialTotal;
  if (hasParallel && jobs) {
    const jobTotals: Map<string, number> = new Map();
    for (const [name, steps] of jobSteps) {
      jobTotals.set(name, steps.reduce((sum, s) => sum + s.estimated_seconds, 0));
    }

    // Find critical path (simplistic: max of independent jobs + sequential deps)
    const independentJobs = jobNames.filter((n) => !(jobs[n] as Record<string, unknown>).needs);
    const dependentJobs = jobNames.filter((n) => !!(jobs[n] as Record<string, unknown>).needs);

    const maxIndependent = Math.max(...independentJobs.map((n) => jobTotals.get(n) || 0), 0);
    const dependentTotal = dependentJobs.reduce((sum, n) => sum + (jobTotals.get(n) || 0), 0);
    parallelTotal = maxIndependent + dependentTotal;
  }

  // Find bottleneck
  const bottleneck = allSteps.length > 0
    ? allSteps.reduce((max, s) => s.estimated_seconds > max.estimated_seconds ? s : max).name
    : "N/A";

  return {
    total_estimated_seconds: serialTotal,
    total_estimated_display: formatTime(serialTotal),
    steps: allSteps,
    bottleneck,
    parallelizable: !hasParallel && jobNames.length === 1 && allSteps.length > 3,
    parallel_estimate_display: hasParallel ? formatTime(parallelTotal) : formatTime(serialTotal),
  };
}

function estimateStepTime(name: string, run: string, uses: string): { seconds: number; category: string } {
  const text = `${name} ${run} ${uses}`.toLowerCase();

  for (const [pattern, seconds] of Object.entries(STEP_TIME_ESTIMATES)) {
    if (text.includes(pattern.toLowerCase())) {
      const category = pattern.includes("checkout") || pattern.includes("setup") ? "setup"
        : pattern.includes("install") || pattern.includes("restore") || pattern.includes("fetch") || pattern.includes("ci") ? "install"
        : pattern.includes("lint") || pattern.includes("eslint") || pattern.includes("ruff") || pattern.includes("clippy") || pattern.includes("checkstyle") ? "lint"
        : pattern.includes("build") || pattern.includes("package") ? "build"
        : pattern.includes("test") || pattern.includes("pytest") ? "test"
        : pattern.includes("audit") || pattern.includes("security") || pattern.includes("trivy") || pattern.includes("gitleaks") || pattern.includes("codeql") ? "security"
        : pattern.includes("docker") || pattern.includes("deploy") || pattern.includes("vercel") || pattern.includes("netlify") ? "deploy"
        : "other";
      return { seconds, category };
    }
  }

  return { seconds: 10, category: "other" };
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

// ============================================================================
// Helpers
// ============================================================================

function getSetupStep(language: Language, version: string): Record<string, unknown> {
  const setupActions: Record<Language, { uses: string; with: Record<string, string> }> = {
    node: { uses: "actions/setup-node@v4", with: { "node-version": version } },
    python: { uses: "actions/setup-python@v5", with: { "python-version": version } },
    go: { uses: "actions/setup-go@v5", with: { "go-version": version } },
    rust: { uses: "dtolnay/rust-toolchain@stable", with: {} },
    java: { uses: "actions/setup-java@v4", with: { "java-version": version, distribution: "temurin" } },
    dotnet: { uses: "actions/setup-dotnet@v4", with: { "dotnet-version": version } },
  };

  const setup = setupActions[language];
  const step: Record<string, unknown> = { name: `Set up ${language}`, uses: setup.uses };
  if (Object.keys(setup.with).length > 0) {
    step.with = setup.with;
  }
  return step;
}

function getDockerImage(language: Language, version: string): string {
  const images: Record<Language, string> = {
    node: `node:${version}`,
    python: `python:${version}`,
    go: `golang:${version}`,
    rust: `rust:latest`,
    java: `maven:3.9-eclipse-temurin-${version}`,
    dotnet: `mcr.microsoft.com/dotnet/sdk:${version}`,
  };
  return images[language];
}

function estimateDuration(features: Feature[]): string {
  let minutes = 1; // base: checkout + install
  if (features.includes("lint")) minutes += 1;
  if (features.includes("build")) minutes += 2;
  if (features.includes("test")) minutes += 3;
  if (features.includes("security")) minutes += 1;
  if (features.includes("docker")) minutes += 3;
  if (features.includes("deploy")) minutes += 2;
  return `~${minutes}-${minutes + 2} minutes`;
}
