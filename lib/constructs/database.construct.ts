import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';

export interface DatabaseConstructProps {
  readonly vpc: ec2.IVpc;
  readonly appSecurityGroup: ec2.ISecurityGroup;
  readonly deletionProtection: boolean;
  readonly removalPolicy: RemovalPolicy;
  readonly backupRetentionDays: number;
}

export class DatabaseConstruct extends Construct {
  public readonly appDatabase: rds.DatabaseCluster;
  public readonly bunkerDatabase: rds.DatabaseInstance;
  public readonly appDatabaseSecurityGroup: ec2.SecurityGroup;
  public readonly bunkerDatabaseSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DatabaseConstructProps) {
    super(scope, id);

    this.appDatabaseSecurityGroup = new ec2.SecurityGroup(this, 'AppDatabaseSecurityGroup', {
      vpc: props.vpc,
      description: 'Allows private backend nodes to reach the app database',
      allowAllOutbound: true,
    });
    this.appDatabaseSecurityGroup.addIngressRule(
      props.appSecurityGroup,
      ec2.Port.tcp(5432),
      'PostgreSQL from private app instances',
    );

    this.bunkerDatabaseSecurityGroup = new ec2.SecurityGroup(this, 'BunkerDatabaseSecurityGroup', {
      vpc: props.vpc,
      description: 'Bunker database access must be granted explicitly',
      allowAllOutbound: true,
    });

    this.appDatabase = new rds.DatabaseCluster(this, 'AppDatabase', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_4,
      }),
      credentials: rds.Credentials.fromGeneratedSecret('app_admin'),
      writer: rds.ClusterInstance.provisioned('writer', {
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
      }),
      readers: [
        rds.ClusterInstance.provisioned('reader', {
          instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
        }),
      ],
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [this.appDatabaseSecurityGroup],
      storageEncrypted: true,
      backup: {
        retention: Duration.days(props.backupRetentionDays),
      },
      deletionProtection: props.deletionProtection,
      removalPolicy: props.removalPolicy,
    });

    this.bunkerDatabase = new rds.DatabaseInstance(this, 'BunkerDatabase', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_4,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      credentials: rds.Credentials.fromGeneratedSecret('bunker_admin'),
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      multiAz: false,
      publiclyAccessible: false,
      storageEncrypted: true,
      securityGroups: [this.bunkerDatabaseSecurityGroup],
      backupRetention: Duration.days(props.backupRetentionDays),
      deletionProtection: props.deletionProtection,
      removalPolicy: props.removalPolicy,
    });
  }
}
