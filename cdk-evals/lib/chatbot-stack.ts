import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface ChatbotStackProps extends cdk.StackProps {
  knowledgeBaseId: string;
}

export class ChatbotStack extends cdk.Stack {
  public readonly publicIp: string;

  constructor(scope: Construct, id: string, props: ChatbotStackProps) {
    super(scope, id, props);

    // Use default VPC — no NAT gateway costs
    const vpc = ec2.Vpc.fromLookup(this, "DefaultVpc", { isDefault: true });

    // Security group: inbound 8000 from anywhere (CloudFront IPs are dynamic),
    // all outbound for Bedrock API calls
    const sg = new ec2.SecurityGroup(this, "ChatbotSg", {
      vpc,
      description: "Chatbot EC2 security group",
      allowAllOutbound: true,
    });
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(8000), "Gunicorn from CloudFront");

    // IAM role: Bedrock + SSM Session Manager
    const role = new iam.Role(this, "Ec2Role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
      ],
    });

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:Retrieve",
        ],
        resources: ["*"],
      })
    );

    // User data: install Python 3.12, clone repo, create venv, systemd service
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "#!/bin/bash",
      "set -euo pipefail",

      // Install dependencies
      "yum install -y python3.12 python3.12-pip git",

      // Clone repo and set up app
      "cd /opt",
      "git clone https://github.com/strands-agents/devtools.git",
      "cd devtools/cdk-evals/chatbot",

      // Python virtual environment
      "python3.12 -m venv .venv",
      "source .venv/bin/activate",
      "pip install -r requirements.txt",
      "pip install gunicorn",

      // Generate Django secret key and create .env
      "DJANGO_SECRET=$(python3.12 -c 'import secrets; print(secrets.token_urlsafe(50))')",
      'cat > .env << EOF',
      `KNOWLEDGE_BASE_ID=${props.knowledgeBaseId}`,
      "AWS_REGION=us-west-2",
      "DJANGO_DEBUG=False",
      "DJANGO_SECRET_KEY=${DJANGO_SECRET}",
      "SESSIONS_DB_PATH=/opt/devtools/cdk-evals/chatbot/sessions.db",
      "EOF",

      // Fix ownership so ec2-user can write SQLite
      "chown -R ec2-user:ec2-user /opt/devtools",

      // Create systemd service
      'cat > /etc/systemd/system/chatbot.service << \'UNIT\'',
      "[Unit]",
      "Description=Evals Chatbot",
      "After=network.target",
      "",
      "[Service]",
      "Type=simple",
      "User=ec2-user",
      "WorkingDirectory=/opt/devtools/cdk-evals/chatbot",
      "ExecStart=/opt/devtools/cdk-evals/chatbot/.venv/bin/gunicorn chatbot.wsgi:application --bind 0.0.0.0:8000 --workers 2 --timeout 120",
      "Restart=always",
      "EnvironmentFile=/opt/devtools/cdk-evals/chatbot/.env",
      "",
      "[Install]",
      "WantedBy=multi-user.target",
      "UNIT",

      "systemctl daemon-reload",
      "systemctl enable chatbot",
      "systemctl start chatbot",
    );

    // EC2 instance in public subnet
    const instance = new ec2.Instance(this, "ChatbotInstance", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup: sg,
      role,
      userData,
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: ec2.BlockDeviceVolume.ebs(20, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
          }),
        },
      ],
      ssmSessionPermissions: true,
    });

    // Elastic IP for stable public address
    const eip = new ec2.CfnEIP(this, "ChatbotEip");
    new ec2.CfnEIPAssociation(this, "ChatbotEipAssoc", {
      allocationId: eip.attrAllocationId,
      instanceId: instance.instanceId,
    });

    // Expose the Elastic IP for CloudFront origin
    this.publicIp = eip.attrPublicIp;

    // Outputs
    new cdk.CfnOutput(this, "PublicIp", {
      value: eip.attrPublicIp,
      description: "Elastic IP for chatbot EC2 instance",
    });

    new cdk.CfnOutput(this, "InstanceId", {
      value: instance.instanceId,
      description: "EC2 instance ID (use SSM Session Manager to connect)",
    });
  }
}
