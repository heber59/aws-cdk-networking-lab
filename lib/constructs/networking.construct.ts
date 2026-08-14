import { Stack } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface NetworkingConstructProps {
  readonly cidr: string;
  readonly natGateways: number;
  readonly maxAzs?: number;
}

export class NetworkingConstruct extends Construct {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: NetworkingConstructProps) {
    super(scope, id);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr(props.cidr),
      maxAzs: props.maxAzs ?? 2,
      natGateways: props.natGateways,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'app',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'db',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    });

    for (const endpoint of [
      { id: 'SecretsManagerEndpoint', service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER },
      { id: 'SsmEndpoint', service: ec2.InterfaceVpcEndpointAwsService.SSM },
      { id: 'Ec2MessagesEndpoint', service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES },
      { id: 'SsmMessagesEndpoint', service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES },
    ]) {
      this.vpc.addInterfaceEndpoint(endpoint.id, {
        service: endpoint.service,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      });
    }

    Stack.of(this).exportValue(this.vpc.vpcId, {
      name: `${Stack.of(this).stackName}-VpcId`,
    });
  }
}
