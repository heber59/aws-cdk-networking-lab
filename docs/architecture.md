# Architecture and Database Design

## 1. Target architecture

This lab uses a multi-region, highly available pattern with public entry points, private application networking, and an isolated private zone for sensitive data.

```text
Region A (primary)                            Region B (secondary)
+------------------------------------+        +------------------------------------+
| VPC 10.10.0.0/16                    |        | VPC 10.20.0.0/16                    |
|                                      |        |                                      |
| Public subnet 10.10.1.0/24          |        | Public subnet 10.20.1.0/24          |
|  - ALB                               |        |  - ALB                               |
|                                      |        |                                      |
| Private subnet 10.10.2.0/24         |        | Private subnet 10.20.2.0/24         |
|  - EC2 frontend node (ASG, :3100)    |        |  - EC2 frontend node (ASG, :3100)    |
|  - EC2 backend node (ASG, :5100)     |        |  - EC2 backend node (ASG, :5100)     |
|  - Lambda ENI if VPC access needed    |        |  - Lambda ENI if VPC access needed    |
|  - secret retrieval (SM)             |        |  - secret retrieval (SM)             |
|                                      |        |                                      |
| Isolated DB subnet                   |        | Isolated DB subnet                   |
|  - app DB (writer/reader)            |        |  - app DB (reader/replica)           |
|  - bunker DB                         |        |  - bunker DB                         |
+------------------------------------+        +------------------------------------+
            |                                             |
            | Route53 + health checks                    | Route53 + health checks
            +---------------------> Internet / users <------------------------------------+

```

## 2. Database design

### Required database layout

The design calls for 3 databases:

1. One secure DB, called the "bunker" DB
2. Two app databases, used by the application tier
3. The frontend and backend tiers sit behind a load balancer

Recommended implementation:

- Use Amazon Aurora for the application databases, because it gives you:
  - multi-AZ resilience in each region
  - cross-region replication possible with Aurora Global Database
  - easier failover than standalone RDS
- Keep the bunker database separate, in its own isolated private subnets or dedicated cluster, with no public access and no internet route.
- Ensure app EC2 does not directly connect to the bunker database unless there is a very specific requirement.

### Suggested DB topology

- Primary region: `us-east-1`
  - app-db-primary (writer)
  - app-db-reader (reader, optional but recommended)
  - bunker-db (isolated, admin-only)
- Secondary region: `us-west-2`
  - app-db-failover (reader/writer promotion candidate)
  - bunker-db-dr (isolated copy or backup-only environment)

### Why this matches your requirement

- The backend EC2 nodes sit behind the ALB and connect privately to the app databases.
- The frontend EC2 nodes serve the user interface and call the backend through the load balancer path routing.
- The bunker DB is isolated from app traffic and is intended for sensitive admin-only data.
- This pattern is easier to secure than having all databases in the same security group and route table.

## 3. Network design

### VPC layout

Each region should have:

- 1 VPC
- at least 2 Availability Zones for high availability
- public subnets for internet-facing ALBs and NAT Gateways
- private app subnets for EC2 instances
- isolated database subnets or private subnet segments reserved for database access

Recommended CIDRs:

- `10.10.0.0/16` (primary region)
- `10.20.0.0/16` (secondary region)

Example subnet plan per AZ:

- Public subnet: `10.10.1.0/24`
- Private app subnet: `10.10.2.0/24`
- Isolated DB subnet: `10.10.3.0/24`

The app subnets and DB subnets can route to each other inside the VPC, but access must be explicitly allowed using security groups. For RDS/Aurora, use DB subnet groups spanning at least 2 AZs.

### Public vs private and NAT

- Public subnet:
  - ALB
  - NAT Gateway
  - no DBs in this subnet
- Private subnet:
  - EC2 frontend node listening on port `3100`
  - EC2 backend node listening on port `5100`
  - Lambda ENI (if Lambda needs VPC access)
- Isolated DB subnet:
  - DBs with no direct internet ingress
- NAT Gateway:
  - created in a public subnet
  - used as the private subnet route for outbound internet connectivity, such as patching and package downloads

### Important nuance about API Gateway

API Gateway is not a subnet; it is a regional AWS service. If your app needs private-only backend communications, use:

- API Gateway + VPC Link + internal ALB
- or API Gateway + Lambda + private DB access

That means you do not put API Gateway in a subnet. Instead, route API Gateway through VPC Link to an internal load balancer, or let the public ALB reach the private app tier directly.

## 4. EC2 + load balancer pattern

- Keep the EC2 instances in private subnets behind an ALB in public subnets.
- Split the application into two private compute tiers:
  - frontend EC2 Auto Scaling Group: minimum=1 and desired=1 per region
  - backend EC2 Auto Scaling Group: minimum=1 and desired=1 per region
- Run the frontend service on port `3100`.
- Run the backend service on port `5100`.
- Route default web traffic (`/*`) from the ALB to the frontend target group on `3100`.
- Route API traffic (`/api/*`) from the ALB to the backend target group on `5100`.
- Route53 routes users to the active regional ALB.
- If one region fails, DNS failover or Route53 health checks send traffic to the secondary region.

Recommended health checks:

- ALB frontend target group health check on `3100`
- ALB backend target group health check on `5100`
- Route53 health check for the public application endpoint
- CloudWatch alarms tied to latency and failed requests

### Docker runtime model

The current CDK stack can be created before application code and AWS container registry credentials exist. That is useful for a lab because the networking, load balancer, EC2 instances, security groups, and databases can be validated first.

When app code is ready, package the tiers separately:

- Frontend image:
  - build from the frontend Dockerfile
  - expose container port `3100`
  - run on the frontend EC2 instances
  - ALB target group forwards to instance port `3100`
- Backend image:
  - build from the backend Dockerfile
  - expose container port `5100`
  - run on the backend EC2 instances
  - ALB target group forwards to instance port `5100`

Recommended deployment flow after AWS credentials are configured:

```bash
# Authenticate Docker to Amazon ECR.
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Build and push separate images.
docker build -t frontend:latest ./frontend
docker build -t backend:latest ./backend

docker tag frontend:latest ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/frontend:latest
docker tag backend:latest ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/backend:latest

docker push ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/frontend:latest
docker push ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/backend:latest
```

The EC2 user data or a later deployment pipeline should then pull the right image on the right tier:

```bash
docker run -d --name frontend --restart unless-stopped -p 3100:3100 frontend:latest
docker run -d --name backend --restart unless-stopped -p 5100:5100 backend:latest
```

Until the AWS credentials and ECR repositories are available, the infrastructure can still be synthesized and tested locally. The sample EC2 user data serves basic health responses on the same ports so the ALB target groups have something to check.

## 5. Lambda use

Use Lambda for on-demand reads, event-driven processing, or pull-only workflows.

Recommended Lambda pattern:

- Lambda reads from the app DB or a replica only when needed
- Lambda does not write to the bunker DB unless a dedicated admin-only service is explicitly required
- Lambda should use a specific IAM role with least privilege
- If Lambda must access private resources, give it VPC access to the private subnet and a security group with DB access only

## 6. IAM and access model

### Developer role

Create a role like `DeveloperAccessRole` that allows:

- AWS Systems Manager Session Manager to reach approved EC2 instances
- read access to CloudWatch logs and metrics
- read-only EC2 metadata for tagged machines only
- no direct DB admin privileges

Use resource tags to restrict scope, for example:

- `team=platform`
- `environment=dev`
- `role=app`

### DB admin role

Create a role like `DBAdminRole` with access to:

- RDS/Aurora describe, snapshot, restore, failover operations
- Secrets Manager access only to the DB secret values
- CloudWatch alarms for database health
- no broad EC2 admin access

### Critical policy rule

- Developers can work on selected EC2s only if their IAM policy matches the EC2 instance tags or account partitions.
- DB admins can work on the database only, not on all compute workloads.

## 7. Security groups and access rules

### ALB security group

- inbound: 80/443 from `0.0.0.0/0`
- outbound: allow to frontend EC2 port `3100` and backend EC2 port `5100`

### EC2 frontend security group

- inbound: port `3100` from ALB security group only
- outbound: allow to the backend endpoint through the ALB or private service path

### EC2 backend security group

- inbound: port `5100` from ALB security group only
- inbound: from VPC or private health-checks only if needed
- outbound: allow to DB port and Secrets Manager / SSM endpoints

### DB security group

- inbound: only from backend EC2 security group
- inbound: only from DB admin or ETL Lambda security group if required
- no public ingress

### Bunker DB security group

- inbound: from DB admin only
- inbound: from a very limited admin security group or approved bastion/operations subnet if required
- no internet route

## 8. Extra AWS configuration you must do

This is the part most people forget.

### 8.1 CDK bootstrap

Bootstrap each target account/region before deploying:

```bash
pnpm exec cdk bootstrap aws://ACCOUNT_ID/REGION
```

Do this for every region you deploy to, for example:

- `aws://111111111111/us-east-1`
- `aws://111111111111/us-west-2`

### 8.2 Secrets Manager

Create secrets for:

- DB master user credentials
- app database credentials
- bunker DB credentials
- optional Lambda/API tokens

Store them in Secrets Manager and grant least-privilege access to:

- app EC2 IAM role
- Lambda execution role
- DB admin role

### 8.3 VPC endpoints

To avoid public internet dependency, create VPC endpoints for:

- SSM
- EC2 Messages
- SSMMessages
- Secrets Manager
- S3 (Gateway endpoint if needed)

This is very important when EC2 lives in private subnets without public IPs.

### 8.4 NAT Gateway and route tables

- One NAT Gateway per AZ for higher availability, or one per region for a lower-cost lab
- Private subnets should route to NAT for outbound internet access
- The public subnet should route to the Internet Gateway

### 8.5 Route53 and health checks

Create:

- public hosted zone for your domain
- records for the ALB in each region
- health checks for both regions
- failover or latency routing

### 8.6 ACM certificate

Request or import certificates in each region you use with ALBs:

- `*.example.com`
- API hostname certificate

Use DNS validation in Route53.

### 8.7 CloudWatch alarms and budgets

Set alarms for:

- CPU utilization on EC2
- DB CPU / storage / latency
- ALB 5xx errors
- Lambda errors
- NAT Gateway data processing

Create AWS Budgets for:

- total monthly spend
- EC2 spend
- RDS spend
- data transfer across regions

### 8.8 Backup and retention

Set up:

- automated daily snapshots for Aurora / RDS
- retention period (for example 7–30 days)
- cross-region snapshot copy if needed
- restore drill documentation

### 8.9 SSM Session Manager access

Instead of SSH, allow admins to use Session Manager for:

- EC2 instance access
- limited troubleshooting
- no need for public SSH ports

### 8.10 Guardrails and tagging

Add tags for:

- `environment`
- `owner`
- `team`
- `db-role`
- `region`

Then use tag-based IAM conditions to restrict deployments and database access.

## 9. Recommended production pattern

If this is a real production lab, use these defaults:

- 2 AWS regions for active-active / active-passive architecture
- 1 frontend EC2 node per region behind ALB
- 1 backend EC2 node per region behind ALB
- 1 Aurora primary and one replica in the secondary region
- 1 bunker DB with isolated SG and restricted DB-admin access
- Route53 failover routing for higher availability
- Lambda for read-only jobs, not for core app write paths

## 10. Minimum config checklist before deployment

Before deploying, read [extra-configuration.md](extra-configuration.md) and configure:

- [ ] AWS account and IAM admin access
- [ ] CDK bootstrap for both target regions
- [ ] GitHub OIDC role for CI/CD
- [ ] Secrets Manager secret values
- [ ] DNS hosted zone and ACM certificate
- [ ] Route53 failover configuration
- [ ] VPC endpoints for SSM and Secrets Manager
- [ ] NAT Gateway and private routing
- [ ] Security groups for ALB, frontend EC2, backend EC2, and DB
- [ ] CloudWatch alarms and budget alarms
- [ ] Backup retention and restore process
- [ ] DB admin and developer IAM policies with least privilege

## 11. Final recommendation

For your exact requirement, the cleanest AWS design is:

- 2 regions
- 1 frontend EC2 group behind ALB on port `3100`
- 1 backend EC2 group behind ALB on port `5100`
- 1 secure bunker DB in isolated private networking
- 2 app databases or an Aurora cluster with cross-region replica support
- API Gateway or ALB in front of application services
- Lambda for on-demand read operations only
- IAM roles for developers and database admins
- GitHub Actions with OIDC and environment promotion

This gives you a realistic hybrid of:

- high availability
- private networking
- strong isolation for the bunker DB
- least-privilege access
- CI/CD support
