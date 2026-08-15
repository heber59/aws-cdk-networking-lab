#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { DevelopmentStage } from '../lib/stages/development.stage';
import { ProductionStage } from '../lib/stages/production.stage';

const app = new cdk.App();

const account = process.env.CDK_DEFAULT_ACCOUNT;
const primaryRegion = process.env.PRIMARY_REGION ?? process.env.CDK_DEFAULT_REGION ?? 'us-east-1';
const secondaryRegion = process.env.SECONDARY_REGION ?? 'us-west-2';

new DevelopmentStage(app, 'Development', {
  env: { account, region: primaryRegion },
});

new ProductionStage(app, 'ProductionPrimary', {
  env: { account, region: primaryRegion },
  cidr: '10.10.0.0/16',
});

new ProductionStage(app, 'ProductionSecondary', {
  env: { account, region: secondaryRegion },
  cidr: '10.20.0.0/16',
});
