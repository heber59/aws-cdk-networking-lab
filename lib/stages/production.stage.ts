import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NetworkStack } from '../stacks/network.stack';

export interface ProductionStageProps extends cdk.StageProps {
  readonly cidr: string;
}

export class ProductionStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: ProductionStageProps) {
    super(scope, id, props);

    new NetworkStack(this, 'Network', {
      env: props.env,
      environmentName: 'prod',
      cidr: props.cidr,
      isProduction: true,
    });
  }
}
