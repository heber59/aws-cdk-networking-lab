import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NetworkStack } from '../stacks/network.stack';

export class DevelopmentStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    new NetworkStack(this, 'Network', {
      env: props?.env,
      environmentName: 'dev',
      cidr: '10.10.0.0/16',
      isProduction: false,
    });
  }
}
