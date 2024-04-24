import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class Lab7Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a new VPC
    const vpc = new ec2.Vpc(this, 'Lab7Vpc', {
      cidr: '10.0.0.0/16',
      natGatewayProvider: ec2.NatProvider.gateway(), // Use NatProvider to create NAT gateways
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'PrivateApp',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED, // Use ec2.SubnetType.PRIVATE_ISOLATED for private subnets
        },
        {
          cidrMask: 24,
          name: 'PrivateDB',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED, // Use ec2.SubnetType.PRIVATE_ISOLATED for private subnets
        },
      ],
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

    // Create an Elastic IP address
    const eip = new ec2.CfnEIP(this, 'EIP');

    // Create a NAT gateway in the public subnet
    const natGateway = new ec2.CfnNatGateway(this, 'NATGateway', {
      subnetId: vpc.publicSubnets[0].subnetId,
      allocationId: eip.attrAllocationId, // Use attrAllocationId to get the Allocation ID
    });

    // Add a route to the NAT Gateway for the first private subnet only
    new ec2.CfnRoute(this, 'PrivateRoute', {
      routeTableId: privateRouteTable.ref,
      destinationCidrBlock: '0.0.0.0/0',
      natGatewayId: natGateway.ref,
    });

    // Associate all private subnets with the private route table
    vpc.isolatedSubnets.forEach((subnet, index) => {
      new ec2.CfnSubnetRouteTableAssociation(this, `PrivateSubnetAssociation${index}`, {
        subnetId: subnet.subnetId,
        routeTableId: privateRouteTable.ref,
      });
    });
  }
}
