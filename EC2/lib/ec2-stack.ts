import * as cdk from 'aws-cdk-lib/core';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

export class MyEc2Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create VPC
    const vpc = new ec2.Vpc(this, 'MyVpc', {
      cidr: '10.0.0.0/16',
      maxAzs: 2, // Ensure we have at least 2 AZs
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'PublicSubnet1',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'PublicSubnet2',
          subnetType: ec2.SubnetType.PUBLIC,
        }
      ]
    });

    // Create EC2 Instances
    const instance1 = this.createInstance('MyInstance1', vpc, ec2.SubnetType.PUBLIC);
    const instance2 = this.createInstance('MyInstance2', vpc, ec2.SubnetType.PUBLIC);

    // Create Load Balancer
    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'MyLoadBalancer', {
      vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: new ec2.SecurityGroup(this, 'LoadBalancerSecurityGroup', {
        vpc,
        allowAllOutbound: true,
      })
    });

    // Create Target Group
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'MyTargetGroup', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.INSTANCE,
      vpc,
    });

    // Add EC2 instances as targets to the target group
    targetGroup.addTarget(new elbv2.InstanceTarget(instance1));
    targetGroup.addTarget(new elbv2.InstanceTarget(instance2));

    // Create Listener
    loadBalancer.addListener('Listener', {
      port: 80,
      defaultTargetGroups: [targetGroup],
    });

    // Export Load Balancer's DNS name to Systems Manager Parameter Store
    new ssm.StringParameter(this, 'LoadBalancerDnsName', {
      parameterName: '/MyEc2Stack/LoadBalancerDnsName',
      stringValue: loadBalancer.loadBalancerDnsName
    });
  }

  private createInstance(id: string, vpc: ec2.IVpc, subnetType: ec2.SubnetType) {
    const instance = new ec2.Instance(this, id, {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2
      }),
      vpc,
      vpcSubnets: { subnetType },
      keyName: 'Chris2', // Replace 'achim' with your key pair name
      userData: ec2.UserData.forLinux()
    });

    instance.connections.allowFromAnyIpv4(ec2.Port.tcp(22), 'Allow SSH access from anywhere');
    instance.connections.allowFromAnyIpv4(ec2.Port.tcp(80), 'Allow HTTP access from anywhere');

    instance.userData.addCommands(
      'yum install -y curl',
      'curl --silent --location https://rpm.nodesource.com/setup_14.x | sudo bash -',
      'yum install -y nodejs',
      'echo "const http = require(\'http\');' +
      'const server = http.createServer((req, res) => {' +
      'res.writeHead(200, {\'Content-Type\': \'text/plain\'});' +
      'const ip = req.connection.remoteAddress;' +
      'res.end(`Hello, your IP address is: ${ip}`);' +
      '});' +
      'server.listen(80, \'0.0.0.0\', () => {' +
      'console.log(\'Server running at http://0.0.0.0:80/\');' +
      '});" > /home/ec2-user/server.js',
      'node /home/ec2-user/server.js &'
    );

    return instance;
  }
}

const app = new cdk.App();
new MyEc2Stack(app, 'MyEc2Stack', {
  env: {
    region: 'us-east-1'
  }
});
