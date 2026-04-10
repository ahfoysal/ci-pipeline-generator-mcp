import { describe, it, expect } from "vitest";
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
} from "../src/tools.js";

// ============================================================================
// generate_pipeline
// ============================================================================

describe("generatePipeline", () => {
  it("generates GitHub Actions YAML for Node.js with test and lint", () => {
    const result = generatePipeline({
      platform: "github-actions",
      language: "node",
      features: ["test", "lint"],
    });

    expect(result.platform).toBe("github-actions");
    expect(result.language).toBe("node");
    expect(result.features_included).toContain("test");
    expect(result.features_included).toContain("lint");
    expect(result.yaml).toContain("actions/checkout@v4");
    expect(result.yaml).toContain("actions/setup-node@v4");
    expect(result.yaml).toContain("npm test");
    expect(result.yaml).toContain("npm run lint");
    expect(result.estimated_duration).toMatch(/~\d+-\d+ minutes/);
  });

  it("generates GitLab CI YAML for Python", () => {
    const result = generatePipeline({
      platform: "gitlab-ci",
      language: "python",
      features: ["test", "build"],
    });

    expect(result.platform).toBe("gitlab-ci");
    expect(result.yaml).toContain("python:");
    expect(result.yaml).toContain("pytest");
    expect(result.yaml).toContain("stages");
  });

  it("generates CircleCI YAML for Go", () => {
    const result = generatePipeline({
      platform: "circleci",
      language: "go",
      features: ["test", "build", "lint"],
    });

    expect(result.platform).toBe("circleci");
    expect(result.yaml).toContain("golang:");
    expect(result.yaml).toContain("go test ./...");
    expect(result.yaml).toContain("workflows");
  });

  it("generates Azure Pipelines YAML", () => {
    const result = generatePipeline({
      platform: "azure-pipelines",
      language: "node",
      features: ["test"],
    });

    expect(result.platform).toBe("azure-pipelines");
    expect(result.yaml).toContain("ubuntu-latest");
    expect(result.yaml).toContain("npm test");
  });

  it("generates Bitbucket Pipelines YAML", () => {
    const result = generatePipeline({
      platform: "bitbucket-pipelines",
      language: "node",
      features: ["test", "lint"],
    });

    expect(result.platform).toBe("bitbucket-pipelines");
    expect(result.yaml).toContain("pipelines");
  });

  it("generates Jenkinsfile", () => {
    const result = generatePipeline({
      platform: "jenkins",
      language: "python",
      features: ["test", "lint", "build"],
    });

    expect(result.platform).toBe("jenkins");
    expect(result.yaml).toContain("pipeline {");
    expect(result.yaml).toContain("stage('Test')");
    expect(result.yaml).toContain("stage('Lint')");
  });

  it("includes security audit step", () => {
    const result = generatePipeline({
      platform: "github-actions",
      language: "node",
      features: ["security"],
    });

    expect(result.yaml).toContain("Security audit");
    expect(result.yaml).toContain("npm audit");
  });

  it("supports all 6 languages", () => {
    const languages = ["node", "python", "go", "rust", "java", "dotnet"] as const;
    for (const lang of languages) {
      const result = generatePipeline({
        platform: "github-actions",
        language: lang,
        features: ["test"],
      });
      expect(result.language).toBe(lang);
      expect(result.yaml.length).toBeGreaterThan(50);
    }
  });
});

// ============================================================================
// validate_pipeline
// ============================================================================

describe("validatePipeline", () => {
  it("validates a correct GitHub Actions config", () => {
    const yaml = `name: CI\non:\n  push:\n    branches: [main]\njobs:\n  ci:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm test`;
    const result = validatePipeline({ yaml_content: yaml, platform: "github-actions" });

    expect(result.valid).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  it("catches invalid YAML syntax", () => {
    const result = validatePipeline({
      yaml_content: "{ bad yaml [[ invalid",
      platform: "github-actions",
    });

    expect(result.valid).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues[0].severity).toBe("error");
  });

  it("catches missing jobs in GitHub Actions", () => {
    const yaml = `name: CI\non:\n  push:\n    branches: [main]`;
    const result = validatePipeline({ yaml_content: yaml, platform: "github-actions" });

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("jobs"))).toBe(true);
  });

  it("warns about missing caching", () => {
    const yaml = `name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm test`;
    const result = validatePipeline({ yaml_content: yaml, platform: "github-actions" });

    expect(result.issues.some((i) => i.message.toLowerCase().includes("cach"))).toBe(true);
  });

  it("warns about :latest Docker tags", () => {
    const yaml = `image: node:latest\nstages:\n  - test\ntest:\n  stage: test\n  script:\n    - npm test`;
    const result = validatePipeline({ yaml_content: yaml, platform: "gitlab-ci" });

    expect(result.issues.some((i) => i.message.includes("latest"))).toBe(true);
  });

  it("validates CircleCI requires version field", () => {
    const yaml = `jobs:\n  build:\n    docker:\n      - image: node:20\n    steps:\n      - checkout`;
    const result = validatePipeline({ yaml_content: yaml, platform: "circleci" });

    expect(result.issues.some((i) => i.message.includes("version"))).toBe(true);
  });
});

// ============================================================================
// add_caching
// ============================================================================

describe("addCaching", () => {
  it("adds GitHub Actions cache step for npm", () => {
    const yaml = `name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: Install dependencies\n        run: npm ci\n      - name: Test\n        run: npm test`;
    const result = addCaching({ yaml_content: yaml, package_manager: "npm" });

    expect(result.yaml).toContain("actions/cache@v4");
    expect(result.yaml).toContain("package-lock.json");
    expect(result.cache_strategy).toContain("package-lock.json");
  });

  it("adds GitLab CI cache for pip", () => {
    const yaml = `image: python:3.12\nstages:\n  - test\nbefore_script:\n  - pip install -r requirements.txt\ntest:\n  stage: test\n  script:\n    - pytest`;
    const result = addCaching({ yaml_content: yaml, package_manager: "pip" });

    expect(result.yaml).toContain("cache");
    expect(result.yaml).toContain("requirements.txt");
  });

  it("does not duplicate cache if already present", () => {
    const yaml = `name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/cache@v4\n        with:\n          path: ~/.npm\n          key: npm-cache\n      - run: npm ci`;
    const result = addCaching({ yaml_content: yaml, package_manager: "npm" });

    const cacheCount = (result.yaml.match(/actions\/cache@v4/g) || []).length;
    expect(cacheCount).toBe(1);
  });

  it("handles unparseable YAML gracefully", () => {
    const result = addCaching({ yaml_content: "{{invalid", package_manager: "npm" });
    expect(result.cache_strategy).toBe("failed");
  });
});

// ============================================================================
// optimize_pipeline
// ============================================================================

describe("optimizePipeline", () => {
  it("parallelizes lint and test into separate jobs", () => {
    const yaml = `name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: Install dependencies\n        run: npm ci\n      - name: Lint\n        run: npm run lint\n      - name: Test\n        run: npm test`;
    const result = optimizePipeline({ yaml_content: yaml });

    expect(result.optimizations_applied.some((o) => o.type === "parallelization")).toBe(true);
  });

  it("adds concurrency group for GitHub Actions", () => {
    const yaml = `name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm test`;
    const result = optimizePipeline({ yaml_content: yaml });

    expect(result.optimizations_applied.some((o) => o.type === "concurrency")).toBe(true);
    expect(result.yaml).toContain("cancel-in-progress");
  });

  it("handles unparseable YAML gracefully", () => {
    const result = optimizePipeline({ yaml_content: "{{bad" });
    expect(result.optimizations_applied).toHaveLength(0);
    expect(result.estimated_speedup).toContain("N/A");
  });
});

// ============================================================================
// convert_pipeline
// ============================================================================

describe("convertPipeline", () => {
  it("converts GitHub Actions to GitLab CI", () => {
    const yaml = `name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci\n      - run: npm run lint\n      - run: npm test`;
    const result = convertPipeline({ yaml_content: yaml, source_platform: "github-actions", target_platform: "gitlab-ci" });

    expect(result.target_platform).toBe("gitlab-ci");
    expect(result.yaml).toContain("stages");
    expect(result.conversion_notes.length).toBeGreaterThan(0);
  });

  it("returns unchanged YAML when source equals target", () => {
    const yaml = `name: CI\non: push`;
    const result = convertPipeline({ yaml_content: yaml, source_platform: "github-actions", target_platform: "github-actions" });

    expect(result.conversion_notes[0]).toContain("no conversion");
  });

  it("detects Node.js from npm commands", () => {
    const yaml = `name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm ci\n      - run: npm test`;
    const result = convertPipeline({ yaml_content: yaml, source_platform: "github-actions", target_platform: "circleci" });

    expect(result.conversion_notes.some((n) => n.includes("node"))).toBe(true);
  });
});

// ============================================================================
// add_security_scanning
// ============================================================================

describe("addSecurityScanning", () => {
  it("adds dependency audit to GitHub Actions Node.js pipeline", () => {
    const yaml = `name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci\n      - run: npm test`;
    const result = addSecurityScanning({ yaml_content: yaml, scanners: ["dependency-audit"] });

    expect(result.scanners_added.length).toBe(1);
    expect(result.yaml).toContain("audit");
  });

  it("adds multiple scanners", () => {
    const yaml = `name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm test`;
    const result = addSecurityScanning({ yaml_content: yaml, scanners: ["dependency-audit", "secrets-detection", "sast"] });

    expect(result.scanners_added.length).toBe(3);
  });

  it("adds scanners to GitLab CI as stages", () => {
    const yaml = `image: python:3.12\nstages:\n  - test\ntest:\n  stage: test\n  script:\n    - pytest`;
    const result = addSecurityScanning({ yaml_content: yaml, scanners: ["dependency-audit"] });

    expect(result.yaml).toContain("security");
    expect(result.scanners_added.length).toBe(1);
  });
});

// ============================================================================
// add_parallelization
// ============================================================================

describe("addParallelization", () => {
  it("splits lint, test, and build into parallel jobs", () => {
    const yaml = `name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: Install\n        run: npm ci\n      - name: Lint\n        run: npm run lint\n      - name: Test\n        run: npm test\n      - name: Build\n        run: npm run build`;
    const result = addParallelization({ yaml_content: yaml });

    expect(result.jobs_created).toContain("lint");
    expect(result.jobs_created).toContain("test");
    expect(result.dependency_graph.length).toBeGreaterThan(0);
  });

  it("returns unchanged if already multiple jobs", () => {
    const yaml = `name: CI\non: push\njobs:\n  lint:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm run lint\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test`;
    const result = addParallelization({ yaml_content: yaml });

    expect(result.estimated_speedup).toContain("already parallel");
  });
});

// ============================================================================
// generate_monorepo_pipeline
// ============================================================================

describe("generateMonorepoPipeline", () => {
  it("generates GitHub Actions pipeline for 3 services", () => {
    const result = generateMonorepoPipeline({
      platform: "github-actions",
      services: [
        { name: "api", path: "packages/api", language: "node", features: ["test", "lint"] },
        { name: "web", path: "packages/web", language: "node", features: ["test", "build"] },
        { name: "worker", path: "packages/worker", language: "python", features: ["test"] },
      ],
    });

    expect(result.services_count).toBe(3);
    expect(result.yaml).toContain("api");
    expect(result.yaml).toContain("web");
    expect(result.yaml).toContain("worker");
    expect(result.yaml).toContain("packages/api");
    expect(result.yaml).toContain("Monorepo CI");
  });

  it("generates GitLab CI with change rules", () => {
    const result = generateMonorepoPipeline({
      platform: "gitlab-ci",
      services: [
        { name: "api", path: "services/api", language: "go", features: ["test", "build"] },
      ],
    });

    expect(result.yaml).toContain("services/api");
    expect(result.yaml).toContain("changes");
  });
});

// ============================================================================
// add_deployment
// ============================================================================

describe("addDeployment", () => {
  it("adds Vercel production deployment", () => {
    const yaml = `name: CI\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm test`;
    const result = addDeployment({ yaml_content: yaml, deploy_target: "vercel", environment: "production" });

    expect(result.yaml).toContain("deploy");
    expect(result.yaml).toContain("Vercel");
    expect(result.required_secrets).toContain("VERCEL_TOKEN");
    expect(result.yaml).toContain("refs/heads/main");
  });

  it("adds GitHub Pages deployment", () => {
    const yaml = `name: CI\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm run build`;
    const result = addDeployment({ yaml_content: yaml, deploy_target: "github-pages", environment: "production" });

    expect(result.yaml).toContain("deploy-pages");
    expect(result.required_secrets).toHaveLength(0);
  });

  it("creates staging deploy with PR trigger", () => {
    const yaml = `name: CI\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test`;
    const result = addDeployment({ yaml_content: yaml, deploy_target: "netlify", environment: "staging" });

    expect(result.yaml).toContain("pull_request");
    expect(result.environment).toBe("staging");
  });
});

// ============================================================================
// estimate_build_time
// ============================================================================

describe("estimateBuildTime", () => {
  it("estimates time for a typical Node.js pipeline", () => {
    const yaml = `name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n      - name: Install\n        run: npm ci\n      - name: Lint\n        run: npm run lint\n      - name: Test\n        run: npm test\n      - name: Build\n        run: npm run build`;
    const result = estimateBuildTime({ yaml_content: yaml });

    expect(result.total_estimated_seconds).toBeGreaterThan(50);
    expect(result.steps.length).toBe(6);
    expect(result.bottleneck).toBeTruthy();
    expect(result.total_estimated_display).toMatch(/\d+/);
    expect(result.parallelizable).toBe(true);
  });

  it("identifies build as bottleneck for Rust", () => {
    const yaml = `name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: Build\n        run: cargo build --release\n      - name: Test\n        run: cargo test`;
    const result = estimateBuildTime({ yaml_content: yaml });

    expect(result.bottleneck).toContain("Build");
    expect(result.total_estimated_seconds).toBeGreaterThan(40);
  });

  it("detects parallel jobs and gives lower estimate", () => {
    const yaml = `name: CI\non: push\njobs:\n  lint:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm run lint\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n  build:\n    runs-on: ubuntu-latest\n    needs: [lint, test]\n    steps:\n      - run: npm run build`;
    const result = estimateBuildTime({ yaml_content: yaml });

    expect(result.parallelizable).toBe(false);
    expect(result.parallel_estimate_display).toBeTruthy();
  });

  it("handles unparseable YAML", () => {
    const result = estimateBuildTime({ yaml_content: "{{bad" });
    expect(result.total_estimated_seconds).toBe(0);
  });
});
