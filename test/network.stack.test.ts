import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/stacks/network.stack';

describe('NetworkStack', () => {
  test('creates expected network, app, and database resources', () => {
    const app = new cdk.App();
    const stack = new NetworkStack(app, 'TestNetworkStack', {
      environmentName: 'test',
      cidr: '10.99.0.0/16',
      isProduction: false,
    });

    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::EC2::VPC', 1);
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
    template.resourceCountIs('AWS::AutoScaling::AutoScalingGroup', 1);
    template.resourceCountIs('AWS::RDS::DBCluster', 1);
    template.resourceCountIs('AWS::RDS::DBInstance', 3);
  });

  test('does not allow direct public database access', () => {
    const app = new cdk.App();
    const stack = new NetworkStack(app, 'SecurityTestNetworkStack', {
      environmentName: 'test',
      cidr: '10.98.0.0/16',
      isProduction: false,
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::RDS::DBInstance', {
      PubliclyAccessible: false,
    });
  });
});
