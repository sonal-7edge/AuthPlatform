# STS AssumeRole Integration — Approach, Setup & Deployment Guide

---

## 1. Purpose

This document describes the **STS AssumeRole integration approach** for letting workloads and
external CI/CD pipelines obtain **short-lived AWS credentials** instead of storing long-term
IAM access keys.

It is written for two audiences:

- **Readers / reviewers** (Infrastructure & Frontend teams) who need to understand and validate the approach.
- **Operators** who need to set it up and run deployments against it.

---

## 2. Why this approach

Long-term IAM access keys (`AKIA...` + secret) are a standing liability:

- They do not expire, so a leak is exploitable indefinitely.
- They must be rotated manually.
- They are easy to accidentally commit to source control or CI logs.

**STS AssumeRole** replaces them with **temporary security credentials** (access key + secret +
session token) that expire automatically (typically 1 hour, max 12). The caller proves its
identity, AWS STS hands back short-lived credentials, and those credentials are scoped to exactly
the permissions of the assumed role.

For **external pipelines** (CI/CD that runs outside AWS), we extend this with
**IAM Roles Anywhere**, which lets a build agent authenticate using an **X.509 certificate**
issued by our private Certificate Authority (CA) — no static AWS keys anywhere in the pipeline.

> Key quote from the AWS reference: *"temporary security credentials … can help limit the impact of
> inadvertently exposed credentials because they have a limited lifespan."*

---

## 3. How it works (the flow)

```
 ┌──────────────┐      1. Present X.509 cert        ┌─────────────────────┐
 │ Build agent  │ ───────────────────────────────► │ IAM Roles Anywhere   │
 │ (CI/CD,      │                                   │  - Trust Anchor (CA) │
 │  external)   │      2. Validate cert signature   │  - Profile           │
 │              │ ◄─────────────────────────────────│                      │
 └──────┬───────┘                                   └──────────┬──────────┘
        │                                                      │ 3. sts:AssumeRole
        │                                                      ▼
        │                                          ┌─────────────────────┐
        │      4. Temporary credentials            │ AWS STS             │
        │ ◄────────────────────────────────────────│ (issues short-lived  │
        │      (AccessKey, Secret, SessionToken)    │  credentials)        │
        ▼                                          └─────────────────────┘
 ┌──────────────┐
 │ AWS CLI/SDK  │  5. Deploy (CloudFormation, S3, DynamoDB, …) with temp creds
 └──────────────┘
```

**Step by step:**

1. The external service presents an X.509 certificate signed by a CA we have registered.
2. IAM Roles Anywhere validates the certificate signature and confirms its issuer (the trust anchor).
3. On success, the service assumes an IAM role via **STS AssumeRole**.
4. STS returns **temporary credentials** with a limited lifespan.
5. The agent uses those credentials with standard AWS tooling to perform the deployment.

For **in-AWS workloads** (EC2, ECS, Lambda, another account) the same `sts:AssumeRole` mechanism
applies, but the identity is an IAM principal / instance role rather than a certificate — no
IAM Roles Anywhere needed.

---

## 4. Core components

| Component | What it is | Where it lives |
|---|---|---|
| **Trust Anchor** | Registers our private CA certificate inside IAM Roles Anywhere so AWS trusts certs it issued. | AWS (IAM Roles Anywhere) |
| **IAM Role** (e.g. `CICDRole`) | The role being assumed. Its **permission policy** defines what can be done; its **trust policy** defines who may assume it. | AWS (IAM) |
| **Profile** | Links the role to IAM Roles Anywhere and enables credential issuance. | AWS (IAM Roles Anywhere) |
| **X.509 certificate + private key** | Issued by the private CA, distributed securely to build agents. | Pipeline secret store |
| **Credential helper** (`aws_signing_helper`) | Tool on the build agent that exchanges the certificate for temporary credentials. | Build agent |

---

## 5. Setup — AWS side

> Run these once per AWS account/environment. Requires admin or a delegated setup role.

### 5.1 Create the IAM role with least-privilege permissions

Attach only the permissions the pipeline actually needs (example: deploy via CloudFormation).

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DescribeStacks",
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "*"
    }
  ]
}
```

### 5.2 Set the trust policy

Allow the IAM Roles Anywhere service to assume the role, restricted to certificates whose
Subject CN matches our build identity.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "rolesanywhere.amazonaws.com" },
      "Action": [
        "sts:AssumeRole",
        "sts:TagSession",
        "sts:SetSourceIdentity"
      ],
      "Condition": {
        "StringEquals": {
          "aws:PrincipalTag/x509Subject/CN": "cicd-build-agent"
        },
        "ArnEquals": {
          "aws:SourceArn": "<TRUST_ANCHOR_ARN>"
        }
      }
    }
  ]
}
```

> Add `aws:SourceArn` = the trust anchor ARN **after** you create the trust anchor (step 5.3),
> then update this policy. This pins the role to a specific trust anchor.

### 5.3 Register the CA as a Trust Anchor

```bash
aws rolesanywhere create-trust-anchor \
  --name "private-ca-trust-anchor" \
  --source 'sourceType=CERTIFICATE_BUNDLE,sourceData={x509CertificateData="<PEM_CA_CERT>"}' \
  --enabled
```

### 5.4 Create the Profile linked to the role

```bash
aws rolesanywhere create-profile \
  --name "cicd-deploy-profile" \
  --role-arns "arn:aws:iam::<ACCOUNT_ID>:role/CICDRole" \
  --enabled
```

### 5.5 Record the ARNs

You will need these three values on the build agent:

- **Trust Anchor ARN** — from 5.3
- **Profile ARN** — from 5.4
- **Role ARN** — `arn:aws:iam::<ACCOUNT_ID>:role/CICDRole`

---

## 6. Setup — pipeline / build-agent side

### 6.1 Install the AWS signing helper

```bash
# Linux x86_64
curl -o aws_signing_helper \
  https://rolesanywhere.amazonaws.com/releases/1.1.1/X86_64/Linux/aws_signing_helper
chmod +x aws_signing_helper
```

### 6.2 Provide the certificate and key securely

Pull the certificate (`cert.pem`) and private key (`key.pem`) from your pipeline secret store
(e.g. Azure DevOps secure files, GitLab CI variables, Jenkins credentials). **Never commit them.**

### 6.3 Obtain temporary credentials

```bash
./aws_signing_helper credential-process \
  --certificate cert.pem \
  --private-key key.pem \
  --trust-anchor-arn  "<TRUST_ANCHOR_ARN>" \
  --profile-arn       "<PROFILE_ARN>" \
  --role-arn          "arn:aws:iam::<ACCOUNT_ID>:role/CICDRole"
```

This returns JSON with `AccessKeyId`, `SecretAccessKey`, `SessionToken`, and `Expiration`.

### 6.4 Wire it into the AWS CLI (recommended)

Use the credential helper as a `credential_process` in an AWS profile so every AWS command
auto-fetches fresh credentials:

```ini
# ~/.aws/config
[profile rolesanywhere]
credential_process = /path/to/aws_signing_helper credential-process \
  --certificate /path/to/cert.pem \
  --private-key /path/to/key.pem \
  --trust-anchor-arn <TRUST_ANCHOR_ARN> \
  --profile-arn <PROFILE_ARN> \
  --role-arn arn:aws:iam::<ACCOUNT_ID>:role/CICDRole
```

---

## 7. Deploying

Once the profile is configured, deploy with **standard AWS tooling** — nothing special required:

```bash
# Verify identity (should print the assumed CICDRole)
aws sts get-caller-identity --profile rolesanywhere

# Example deploy
aws cloudformation deploy \
  --profile rolesanywhere \
  --template-file template.yaml \
  --stack-name auth-platform \
  --capabilities CAPABILITY_IAM
```

The credentials are fetched and refreshed automatically by the credential helper; they expire on
their own, so there is nothing to rotate.

---


## 8. Validation checklist (for reviewing teams)

**Infrastructure team — please confirm:**

- [ ] Trust anchor uses our approved private CA.
- [ ] IAM role permissions follow least privilege (no `*` in production).
- [ ] Trust policy is pinned to the trust anchor ARN and the correct certificate CN.
- [ ] Credential lifetime (session duration) meets policy.
- [ ] Certificate/key storage and rotation process is acceptable.

**Frontend team — please confirm:**

- [ ] Deployment flow integrates with the existing CI/CD pipeline.
- [ ] No long-term AWS keys remain in pipeline config or environment.
- [ ] Build/deploy steps for frontend artifacts (e.g. S3 + CloudFront) work end-to-end.

---
