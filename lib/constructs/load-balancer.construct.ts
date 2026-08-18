import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

export interface LoadBalancerConstructProps {
  readonly vpc: ec2.IVpc;
  readonly frontendDesiredCapacity: number;
  readonly backendDesiredCapacity: number;
  readonly maxCapacity: number;
}

export class LoadBalancerConstruct extends Construct {
  public readonly frontendSecurityGroup: ec2.SecurityGroup;
  public readonly backendSecurityGroup: ec2.SecurityGroup;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly frontendAutoScalingGroup: autoscaling.AutoScalingGroup;
  public readonly backendAutoScalingGroup: autoscaling.AutoScalingGroup;

  constructor(scope: Construct, id: string, props: LoadBalancerConstructProps) {
    super(scope, id);

    const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: props.vpc,
      description: 'Allows public HTTP access to the application load balancer',
      allowAllOutbound: true,
    });
    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Public HTTP');

    this.frontendSecurityGroup = new ec2.SecurityGroup(this, 'FrontendSecurityGroup', {
      vpc: props.vpc,
      description: 'Allows traffic from the ALB to private frontend instances',
      allowAllOutbound: true,
    });
    this.frontendSecurityGroup.addIngressRule(albSecurityGroup, ec2.Port.tcp(3100), 'Frontend HTTP from ALB');

    this.backendSecurityGroup = new ec2.SecurityGroup(this, 'BackendSecurityGroup', {
      vpc: props.vpc,
      description: 'Allows traffic from the ALB to private backend instances',
      allowAllOutbound: true,
    });
    this.backendSecurityGroup.addIngressRule(albSecurityGroup, ec2.Port.tcp(5100), 'Backend HTTP from ALB');

    const frontendUserData = ec2.UserData.forLinux();
    frontendUserData.addCommands(
      'dnf install -y nginx || yum install -y nginx',
      'cat > /etc/nginx/conf.d/frontend.conf <<EOF',
      'server {',
      '  listen 3100;',
      '  location /health { return 200 "ok\\n"; add_header Content-Type text/plain; }',
      '  location / { root /usr/share/nginx/html; index index.html; }',
      '}',
      'EOF',
      'cat > /usr/share/nginx/html/index.html <<EOF',
      '<h1>AWS CDK Networking Lab</h1>',
      '<p>Frontend node healthy on port 3100.</p>',
      'EOF',
      'systemctl enable nginx',
      'systemctl start nginx',
    );

    const backendUserData = ec2.UserData.forLinux();
    backendUserData.addCommands(
      'dnf install -y nginx || yum install -y nginx',
      'cat > /etc/nginx/conf.d/backend.conf <<EOF',
      'server {',
      '  listen 5100;',
      '  location /health { return 200 "ok\\n"; add_header Content-Type text/plain; }',
      '  location / { return 200 "{\\"service\\":\\"backend\\",\\"port\\":5100}\\n"; add_header Content-Type application/json; }',
      '}',
      'EOF',
      'systemctl enable nginx',
      'systemctl start nginx',
    );

    this.frontendAutoScalingGroup = new autoscaling.AutoScalingGroup(this, 'FrontendAsg', {
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      minCapacity: 1,
      desiredCapacity: props.frontendDesiredCapacity,
      maxCapacity: props.maxCapacity,
      securityGroup: this.frontendSecurityGroup,
      userData: frontendUserData,
    });

    this.backendAutoScalingGroup = new autoscaling.AutoScalingGroup(this, 'BackendAsg', {
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      minCapacity: 1,
      desiredCapacity: props.backendDesiredCapacity,
      maxCapacity: props.maxCapacity,
      securityGroup: this.backendSecurityGroup,
      userData: backendUserData,
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

    listener.addTargets('FrontendTargets', {
      port: 3100,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [this.frontendAutoScalingGroup],
      healthCheck: {
        path: '/health',
        healthyHttpCodes: '200',
      },
    });

    listener.addTargets('BackendTargets', {
      port: 5100,
      protocol: elbv2.ApplicationProtocol.HTTP,
      priority: 10,
      conditions: [elbv2.ListenerCondition.pathPatterns(['/api/*'])],
      targets: [this.backendAutoScalingGroup],
      healthCheck: {
        path: '/health',
        healthyHttpCodes: '200',
      },
    });
  }
}
