# Changelog

All notable changes to AuthPlatform are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Entries are added automatically by the docs-update workflow when a pull request is merged.

## [Unreleased]

## [1.0.0] - 2026-07-14

### Added
- Cognito provisioning dashboard (`admin-code/admin-frontend`): multi-step wizard covering sign-in options, password policy, MFA, attributes, account recovery, messaging (SES/SNS + custom sender Lambdas), device tracking, advanced security, Lambda triggers, app clients, and hosted-UI domain.
- Client-side CloudFormation generator producing `AWS::Cognito::UserPool`, per-app `AWS::Cognito::UserPoolClient`, optional `AWS::Cognito::UserPoolDomain`, and `AWS::SES::Template` resources, with YAML/JSON export.
- Admin backend service (`admin-code/admin-backend`): Express server with `/` and `/health` endpoints, CORS, compression, dotenv config.
- STS AssumeRole integration guide (`documentation-application/docs/sts-assumerole-integration.md`): keyless CI/CD deployment via IAM Roles Anywhere.
- Integration & usage guide (`documentation-application/docs/integration-guide.md`).
- Monorepo tooling: Husky + lint-staged, ESLint CI workflow across all five sub-projects.
- Scaffolds for the runtime auth backend (`backend-code`), end-user frontend (`frontend-code`), and documentation site (`documentation-application`).
