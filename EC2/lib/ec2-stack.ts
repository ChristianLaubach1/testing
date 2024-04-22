import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';

export class MyEc2Stack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Create a VPC with specific public subnet configurations
        const vpc = new ec2.Vpc(this, 'MyVpc', {
            cidr: '10.0.0.0/16',
            maxAzs: 3,
            subnetConfiguration: [
                {
                    name: 'PublicSubnet',
                    subnetType: ec2.SubnetType.PUBLIC,
                    cidrMask: 24
                }
            ]
        });

        // Security group for allowing SSH and HTTP access
        const securityGroup = new ec2.SecurityGroup(this, 'InstanceSecurityGroup', {
            vpc,
            description: 'Allow SSH and HTTP inbound',
            allowAllOutbound: true,
        });
        securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow SSH access from anywhere');
        securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP access from anywhere');

        // IAM role for EC2 instances
        const role = new iam.Role(this, 'InstanceSSMRole', {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
            description: 'Role that allows EC2 instances to interact with Systems Manager',
        });
        role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));

        // Launch template for EC2 instances
        const launchTemplate = new ec2.LaunchTemplate(this, 'LaunchTemplate', {
            machineImage: ec2.MachineImage.latestAmazonLinux({
                generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2
            }),
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
            keyName: 'markus',
            securityGroup: securityGroup,
            role: role,
            userData: ec2.UserData.custom(`#!/bin/bash
                yum update -y
                yum install -y httpd php
                INSTANCE_IP=$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4)
                echo "<?php echo 'Server IP Address: $INSTANCE_IP'; ?>" > /var/www/html/index.php
                systemctl enable httpd
                systemctl start httpd
            `)
        });

        // Auto Scaling Group configuration
        const asg = new autoscaling.AutoScalingGroup(this, 'AutoScalingGroup', {
            vpc,
            launchTemplate: launchTemplate,
            minCapacity: 3,
            maxCapacity: 6,
            desiredCapacity: 3,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PUBLIC,
            }
        });

        // Application Load Balancer
        const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'MyLoadBalancer', {
            vpc,
            internetFacing: true,
        });

        const listener = loadBalancer.addListener('Listener', {
            port: 80
        });
        listener.addTargets('Target', {
            port: 80,
            targets: [asg]
        });

        // SSM Parameter for Load Balancer DNS Name
        new ssm.StringParameter(this, 'LoadBalancerDnsName', {
            parameterName: '/MyEc2Stack/LoadBalancerDnsName',
            stringValue: loadBalancer.loadBalancerDnsName
        });
    }
}

const app = new cdk.App();
new MyEc2Stack(app, 'MyEc2Stack', {
    env: {
        region: 'us-east-1'
    }
});
