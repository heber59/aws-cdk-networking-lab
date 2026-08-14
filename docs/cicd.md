# CI/CD and AWS Prerequisites

## 1. GitHub Actions strategy

Use three environments:

- `feature` branch: pull request validation
- `develop`: deployment to development AWS account/region
- `main`: deployment to production account/region with approval gate

Recommended workflow files:

- `.github/workflows/pull-request.yml`
- `.github/workflows/deploy-dev.yml`
- `.github/workflows/deploy-prod.yml`

## 2. PR workflow

The PR workflow should run on every pull request.

Jobs:

- install dependencies
- lint and TypeScript build
- unit tests
- `cdk synth`
- optionally run `cdk diff` with a read-only AWS role
- fail on build, test, or synth errors

Example:

```yaml
name: PR Validation

on:
  pull_request:
    branches: [develop, main]

jobs:
  validate:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm test
      - run: pnpm synth
```

If you want PR diffs against live AWS state, add OIDC permissions and assume a limited diff role before running `pnpm exec cdk diff --no-change-set`. Keep that step non-deploying.

## 3. Dev deployment workflow

Flow:

- trigger on push to `develop`
- configure AWS credentials with IAM OIDC role
- deploy the development stage

Example:

```yaml
name: Deploy Dev

on:
  push:
    branches: [develop]

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: development
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::111111111111:role/GitHubActions-Deploy-Dev
          aws-region: us-east-1
      - run: pnpm exec cdk deploy Development/Network --require-approval never
```

## 4. Production deployment workflow

Flow:

- trigger on push to `main`
- require manual approval via GitHub environment protection
- deploy production stage

Example:

```yaml
name: Deploy Prod

on:
  push:
    branches: [main]

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::222222222222:role/GitHubActions-Deploy-Prod
          aws-region: us-east-1
      - run: pnpm exec cdk deploy ProductionPrimary/Network --require-approval never
```

## 5. AWS setup required before GitHub Actions can deploy

You must configure these before the first deploy:

See [extra-configuration.md](extra-configuration.md) for the full checklist.

### 5.1 IAM OIDC trust for GitHub

Create an IAM role with a trust policy like:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:<OWNER>/<REPO>:ref:refs/heads/develop"
        }
      }
    }
  ]
}
```

Then attach policy permissions to deploy CDK stacks. Create separate trust conditions for `develop` and `main`, or use separate roles per environment as shown in the deployment examples.

### 5.2 CDK bootstrap

Run once for each account and region:

```bash
pnpm exec cdk bootstrap aws://ACCOUNT_ID/REGION
```

### 5.3 Secrets and parameters

Store the following in AWS Secrets Manager or SSM Parameter Store:

- DB username/password secrets
- application configuration values
- API keys or service credentials

### 5.4 Route53 and ACM

- create hosted zones
- create certificate requests
- validate certificates with DNS

## 6. Extra configuration checklist

Before production use, add:

- VPC endpoints for Secrets Manager, SSM, EC2 Messages
- NAT Gateway configuration
- Security groups for ALB, EC2, DB, and bunker DB
- CloudWatch alarms and logs
- AWS Budgets for cost alerts
- RDS or Aurora backup retention
- cross-region snapshot replication if needed
- IAM tag policy for developer and DB-admin access
- Route53 failover health checks
- separate dev/prod account or at least isolated environments

## 7. Recommended operational split

- App developers: tag-based access to app EC2 only
- DB admins: RDS/Aurora and Secrets Manager access only
- Platform team: full CDK deploy permissions for the account

This keeps normal developers away from the bunker DB and limits DB admin access to database operations only.
