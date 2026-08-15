# Extra AWS Configuration Before Deployment

This project creates real infrastructure. Complete this checklist before running `cdk deploy`.

## 1. AWS Accounts and Regions

- Choose whether dev and prod use separate AWS accounts or one account with separate environments.
- Confirm the primary region, defaulting to `us-east-1`.
- Confirm the secondary region, defaulting to `us-west-2`.
- Set local environment variables if you want different regions:

```bash
export PRIMARY_REGION=us-east-1
export SECONDARY_REGION=us-west-2
```

## 2. CDK Bootstrap

Bootstrap every account and region you will deploy into:

```bash
pnpm exec cdk bootstrap aws://ACCOUNT_ID/us-east-1
pnpm exec cdk bootstrap aws://ACCOUNT_ID/us-west-2
```

For separate dev and prod accounts, run bootstrap in both accounts.

## 3. GitHub OIDC Roles

Create one deploy role per environment:

- `GitHubActions-Deploy-Dev`
- `GitHubActions-Deploy-Prod`

The trust policy must allow GitHub Actions to assume the role from the expected branch:

- `develop` for dev
- `main` for prod

Replace these placeholders in the workflow files:

- `111111111111`
- `222222222222`
- role names if you choose different names

## 4. GitHub Environments

Create GitHub environments:

- `development`
- `production`

For `production`, enable required reviewers so the production workflow has a manual approval gate.

## 5. Domain, Route53, and Certificates

If you want public DNS and HTTPS:

- Create or choose a Route53 hosted zone.
- Request ACM certificates in every ALB region.
- Use DNS validation through Route53.
- Add Route53 records for each ALB.
- Add Route53 health checks and failover records.

The initial stack exposes HTTP on the ALB. Add HTTPS listeners after the certificate ARN and domain names are known.

## 6. Secrets Manager

The CDK stack generates database credentials automatically in Secrets Manager.

Before connecting a real application, decide:

- secret naming convention
- rotation policy
- which IAM roles can read app DB secrets
- which IAM roles can read bunker DB secrets

Do not grant normal developer roles access to bunker DB secret values.

## 7. IAM Access Split

Create or refine these role boundaries:

- Developers: Session Manager and read-only diagnostics for tagged app EC2 instances.
- DB admins: RDS/Aurora operations and selected Secrets Manager access.
- Platform team: CDK deployment permissions.

Use resource tags such as:

- `environment`
- `team`
- `project`
- `role`
- `db-role`

## 8. Cost Controls

Create AWS Budgets before deploying:

- monthly total account spend
- RDS spend
- EC2 spend
- NAT Gateway spend
- inter-region data transfer

For a low-cost lab, deploy only `Development/Network` first and destroy it when finished.

## 9. Operations

Add or verify:

- CloudWatch alarms for ALB 5xx errors
- EC2 CPU alarms
- RDS CPU, storage, and connection alarms
- backup retention policy
- restore drill notes
- SSM Session Manager access
- VPC endpoints for SSM, EC2 Messages, SSM Messages, Secrets Manager, and S3

## 10. First Deploy

Install dependencies, synthesize, and deploy dev:

```bash
pnpm install
pnpm build
pnpm test
pnpm synth
pnpm exec cdk deploy Development/Network
```

Deploy production only after confirming the cost, DNS, IAM, and approval settings:

```bash
pnpm exec cdk deploy ProductionPrimary/Network
pnpm exec cdk deploy ProductionSecondary/Network
```
