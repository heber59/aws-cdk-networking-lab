# AWS CDK Networking Lab

Build a production-inspired AWS infrastructure lab using AWS CDK, GitHub Actions, environment promotion, IAM/OIDC, and networking best practices.

## What This Creates

- A multi-AZ VPC per environment
- Public subnets for the internet-facing Application Load Balancer and NAT Gateway
- Private subnets for EC2 application nodes in an Auto Scaling Group
- Isolated database subnets for Aurora app data and a separate bunker database
- Security groups that keep ALB, app, app DB, and bunker DB access separated
- Development and production CDK stages
- GitHub Actions workflows for PR validation and environment deployment

## Project Structure

```text
aws-cdk-networking-lab/
├── .github/
│   └── workflows/
│       ├── pull-request.yml
│       ├── deploy-dev.yml
│       └── deploy-prod.yml
├── bin/
│   └── app.ts
├── lib/
│   ├── constructs/
│   │   ├── database.construct.ts
│   │   ├── load-balancer.construct.ts
│   │   └── networking.construct.ts
│   ├── stacks/
│   │   └── network.stack.ts
│   └── stages/
│       ├── development.stage.ts
│       └── production.stage.ts
├── test/
│   └── network.stack.test.ts
├── docs/
│   ├── architecture.md
│   ├── cicd.md
│   └── extra-configuration.md
├── cdk.json
├── package.json
├── tsconfig.json
└── README.md
```

## Useful Commands

```bash
pnpm install
pnpm build
pnpm test
pnpm synth
pnpm exec cdk deploy Development/Network
```

## CI/CD Workflow

```text
feature/vpc-routing
        |
        | Pull request
        v
+------------------+
|     develop      |
+--------+---------+
         |
         v
 CI / Validation
 |-- lint
 |-- unit tests
 |-- cdk synth
 `-- optional cdk diff
         |
         v
 Development Stage
         |
         | PR / promotion
         v
+------------------+
|       main       |
+--------+---------+
         |
         v
 CI / Validation
         |
         v
 Manual approval
         |
         v
 Production Stage
```

## Before Deploying

Read [docs/extra-configuration.md](docs/extra-configuration.md) before the first deploy. The stack creates real AWS resources, including NAT Gateway, EC2, and RDS resources that can generate cost.
