import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/stacks/network.stack';

describe('NetworkStack', () => {
  const synthTemplate = () => {
    const app = new cdk.App();
    const stack = new NetworkStack(app, 'TestNetworkStack', {
      environmentName: 'test',
      cidr: '10.99.0.0/16',
      isProduction: false,
    });

    return Template.fromStack(stack);
  };

  test('creates expected network, app, and database resources', () => {
    const template = synthTemplate();

    template.resourceCountIs('AWS::EC2::VPC', 1);
    template.resourceCountIs('AWS::EC2::Subnet', 6);
    template.resourceCountIs('AWS::EC2::NatGateway', 1);
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
    template.resourceCountIs('AWS::AutoScaling::AutoScalingGroup', 1);
    template.resourceCountIs('AWS::RDS::DBCluster', 1);
    template.resourceCountIs('AWS::RDS::DBInstance', 3);
  });

  test('places public load balancer in internet-facing mode', () => {
    const template = synthTemplate();

    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      Scheme: 'internet-facing',
      Type: 'application',
    });

    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      Port: 80,
      Protocol: 'HTTP',
    });
  });

  test('keeps application instances private and behind the target group', () => {
    const template = synthTemplate();

    template.hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
      MinSize: '2',
      DesiredCapacity: '2',
      MaxSize: '3',
      TargetGroupARNs: Match.arrayWith([
        {
          Ref: Match.stringLikeRegexp('AppTierAlbHttpListenerAppTargetsGroup'),
        },
      ]),
    });

    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      HealthCheckPath: '/health',
      Matcher: {
        HttpCode: '200',
      },
      Port: 80,
      Protocol: 'HTTP',
    });
  });

  test('allows public HTTP only to the ALB and database traffic only from app instances', () => {
    const template = synthTemplate();

    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: 'Allows public HTTP access to the application load balancer',
      SecurityGroupIngress: Match.arrayWith([
        {
          CidrIp: '0.0.0.0/0',
          Description: 'Public HTTP',
          FromPort: 80,
          IpProtocol: 'tcp',
          ToPort: 80,
        },
      ]),
    });

    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      Description: 'HTTP from ALB',
      FromPort: 80,
      IpProtocol: 'tcp',
      SourceSecurityGroupId: Match.anyValue(),
      ToPort: 80,
    });

    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      Description: 'PostgreSQL from private app instances',
      FromPort: 5432,
      IpProtocol: 'tcp',
      SourceSecurityGroupId: Match.anyValue(),
      ToPort: 5432,
    });
  });

  test('does not allow direct public database access', () => {
    const template = synthTemplate();

    template.hasResourceProperties('AWS::RDS::DBInstance', {
      PubliclyAccessible: false,
      StorageEncrypted: true,
    });

    template.hasResourceProperties('AWS::RDS::DBCluster', {
      StorageEncrypted: true,
    });
  });
});
