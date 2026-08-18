import { CfnOutput, RemovalPolicy, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DatabaseConstruct } from '../constructs/database.construct';
import { LoadBalancerConstruct } from '../constructs/load-balancer.construct';
import { NetworkingConstruct } from '../constructs/networking.construct';

export interface NetworkStackProps extends StackProps {
  readonly environmentName: string;
  readonly cidr: string;
  readonly isProduction: boolean;
}

export class NetworkStack extends Stack {
  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const networking = new NetworkingConstruct(this, 'Networking', {
      cidr: props.cidr,
      natGateways: props.isProduction ? 2 : 1,
      maxAzs: 2,
    });

    const appTier = new LoadBalancerConstruct(this, 'AppTier', {
      vpc: networking.vpc,
      frontendDesiredCapacity: 1,
      backendDesiredCapacity: 1,
      maxCapacity: props.isProduction ? 6 : 3,
    });

    new DatabaseConstruct(this, 'Databases', {
      vpc: networking.vpc,
      appSecurityGroup: appTier.backendSecurityGroup,
      backupRetentionDays: props.isProduction ? 30 : 7,
      deletionProtection: props.isProduction,
      removalPolicy: props.isProduction ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    Tags.of(this).add('environment', props.environmentName);
    Tags.of(this).add('team', 'platform');
    Tags.of(this).add('project', 'aws-cdk-networking-lab');

    new CfnOutput(this, 'ApplicationUrl', {
      value: `http://${appTier.loadBalancer.loadBalancerDnsName}`,
    });
  }
}
