import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

export interface LoadBalancerConstructProps {
  readonly vpc: ec2.IVpc;
  readonly desiredCapacity: number;
  readonly maxCapacity: number;
}

export class LoadBalancerConstruct extends Construct {
  public readonly appSecurityGroup: ec2.SecurityGroup;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly autoScalingGroup: autoscaling.AutoScalingGroup;

  constructor(scope: Construct, id: string, props: LoadBalancerConstructProps) {
    super(scope, id);

    const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: props.vpc,
      description: 'Allows public HTTP access to the application load balancer',
      allowAllOutbound: true,
    });
    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Public HTTP');

    this.appSecurityGroup = new ec2.SecurityGroup(this, 'AppSecurityGroup', {
      vpc: props.vpc,
      description: 'Allows traffic from the ALB to private app instances',
      allowAllOutbound: true,
    });
    this.appSecurityGroup.addIngressRule(albSecurityGroup, ec2.Port.tcp(80), 'HTTP from ALB');

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      'dnf install -y nginx || yum install -y nginx',
      'cat > /usr/share/nginx/html/index.html <<EOF',
      '<h1>AWS CDK Networking Lab</h1>',
      '<p>App node healthy.</p>',
      'EOF',
      'cat > /usr/share/nginx/html/health <<EOF',
      'ok',
      'EOF',
      'systemctl enable nginx',
      'systemctl start nginx',
    );

    this.autoScalingGroup = new autoscaling.AutoScalingGroup(this, 'AppAsg', {
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      minCapacity: 2,
      desiredCapacity: props.desiredCapacity,
      maxCapacity: props.maxCapacity,
      securityGroup: this.appSecurityGroup,
      userData,
    });

    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    const listener = this.loadBalancer.addListener('HttpListener', {
      port: 80,
      open: false,
    });

    listener.addTargets('AppTargets', {
      port: 80,
      targets: [this.autoScalingGroup],
      healthCheck: {
        path: '/health',
        healthyHttpCodes: '200',
      },
    });
  }
}
