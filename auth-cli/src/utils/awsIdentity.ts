import chalk from 'chalk';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { fromEnv, fromIni } from '@aws-sdk/credential-providers';
import { logger } from './logger';

export interface AwsIdentity {
  accountId: string;
  arn: string;
}

// GetCallerIdentity is region-agnostic — the region is only needed to construct the STS
// endpoint, not to select which account/identity gets resolved.
const STS_CLIENT_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';

async function resolveAwsIdentity(profile?: string): Promise<AwsIdentity> {
  // Deliberately narrower than the SDK's default provider chain: with no --profile, only
  // AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_SESSION_TOKEN env vars are honored. Otherwise a
  // stale `[default]` entry in ~/.aws/credentials gets picked up silently, deploying to whatever
  // account that profile points at instead of failing loudly when the caller forgot to export
  // credentials.
  const client = new STSClient({
    region: STS_CLIENT_REGION,
    credentials: profile ? fromIni({ profile }) : fromEnv(),
  });

  try {
    const result = await client.send(new GetCallerIdentityCommand({}));

    if (!result.Account || !result.Arn) {
      throw new Error('STS response did not include an account ID and ARN.');
    }

    return { accountId: result.Account, arn: result.Arn };
  } finally {
    client.destroy();
  }
}

// Verifies AWS credentials are present and valid by resolving the caller's identity via STS,
// printing which account/identity will be used. Exits the process if no usable credentials
// are found, rather than letting a downstream `sam deploy` fail with a less obvious error.
export async function requireAwsIdentity(profile?: string): Promise<AwsIdentity> {
  try {
    const identity = await resolveAwsIdentity(profile);
    logger.info(`AWS Account: ${chalk.bold(identity.accountId)} (${identity.arn})`);
    return identity;
  } catch (err) {
    logger.error(`Unable to verify AWS credentials: ${(err as Error).message}`);
    logger.list([
      'Export AWS credentials before running this command, e.g.:',
      'export AWS_ACCESS_KEY_ID=...',
      'export AWS_SECRET_ACCESS_KEY=...',
      'export AWS_SESSION_TOKEN=...   # only if using temporary/SSO credentials',
      'or pass --profile <name> to use a named AWS CLI profile',
    ]);
    return process.exit(1);
  }
}
