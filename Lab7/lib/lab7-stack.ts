import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

export class MyVpcStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a new VPC
    const vpc = new ec2.Vpc(this, 'MyVpc', {
      cidr: '10.0.0.0/16',
      natGateways: 1, // Create a single NAT Gateway
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'PrivateApp',
          subnetType: ec2.SubnetType.PRIVATE,
        },
        {
          cidrMask: 24,
          name: 'PrivateDB',
          subnetType: ec2.SubnetType.PRIVATE,
        },
      ],
    });

    // Create an Internet Gateway and attach it to the VPC
    const internetGateway = new ec2.CfnInternetGateway(this, 'InternetGateway');
    const gatewayAttachment = new ec2.CfnVPCGatewayAttachment(this, 'GatewayAttachment', {
      vpcId: vpc.vpcId,
      internetGatewayId: internetGateway.ref,
    });

    // Create a route table for public subnets
    const publicRouteTable = new ec2.CfnRouteTable(this, 'PublicRouteTable', {
      vpcId: vpc.vpcId,
    });

    // Associate public subnets with the public route table
    vpc.publicSubnets.forEach((subnet, index) => {
      new ec2.CfnSubnetRouteTableAssociation(this, `PublicSubnetAssociation${index}`, {
        subnetId: subnet.subnetId,
        routeTableId: publicRouteTable.ref,
      });
    });

    // Create a route table for private subnets
    const privateRouteTable = new ec2.CfnRouteTable(this, 'PrivateRouteTable', {
      vpcId: vpc.vpcId,
    });

    // Add a route to the NAT Gateway for each private subnet
    vpc.privateSubnets.forEach((subnet, index) => {
      new ec2.CfnRoute(this, `PrivateRoute${index}`, {
        routeTableId: privateRouteTable.ref,
        destinationCidrBlock: '0.0.0.0/0',
        natGatewayId: vpc.natGateways[0].natGatewayId,
      });

      new ec2.CfnSubnetRouteTableAssociation(this, `PrivateSubnetAssociation${index}`, {
        subnetId: subnet.subnetId,
        routeTableId: privateRouteTable.ref,
      });
    });
  }
}

const app = new cdk.App();
new MyVpcStack(app, 'MyVpcStack');
