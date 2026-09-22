import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { Command } from 'commander';
import inquirer from 'inquirer';
import { logger } from '../utils/logger';
import { requireAwsIdentity } from '../utils/awsIdentity';
import { fileExists, resolveOutputPath } from '../utils/fileUtils';
import { DEPLOY_ENVIRONMENTS, DeployEnvironment } from '../config/constants';
import { filterYesNo, transformYesNo, validateYesNo } from '../prompts/yesNoQuestion';

export interface DeployOptions {
  stackName: string;
  profile?: string;
  region?: string;
  environment?: string;
}

const SAM_INSTALL_DIR = path.join(os.homedir(), '.aws-sam-cli');
const SAM_BIN_DIR = path.join(os.homedir(), '.local', 'bin');

// Reflects the shell that launched the CLI: exported vars are inherited via process.env,
// so this only catches the "forgot to export anything" case, not stale/expired credentials.
export function hasAwsCredentialsInEnv(): boolean {
  return Boolean(
    (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) || process.env.AWS_PROFILE,
  );
}

export function isSamCliAvailable(): boolean {
  const result = spawnSync('sam', ['--version'], { stdio: 'ignore' });
  return !result.error && result.status === 0;
}

function isToolAvailable(bin: string): boolean {
  return !spawnSync(bin, ['--version'], { stdio: 'ignore' }).error;
}

function linuxArchAssetName(): string | null {
  // Matches the asset names AWS actually publishes for standalone Linux installs.
  if (process.arch === 'x64') return 'aws-sam-cli-linux-x86_64.zip';
  if (process.arch === 'arm64') return 'aws-sam-cli-linux-arm64.zip';
  return null;
}

// Downloads AWS's self-contained standalone installer (bundles its own Python runtime) and
// installs it under the user's home directory, so it never touches system/venv Python and
// never needs sudo. Linux only — macOS/Windows ship different installer formats (.pkg/.msi)
// that can't be silently run headless the same way.
function installSamCliStandalone(): boolean {
  const assetName = linuxArchAssetName();
  if (!assetName) {
    logger.error(`Unsupported architecture for auto-install: ${process.arch}`);
    return false;
  }

  if (!isToolAvailable('curl') || !isToolAvailable('unzip')) {
    logger.error(
      'Auto-install requires `curl` and `unzip` on PATH. Install those first, or install SAM CLI manually.',
    );
    return false;
  }

  const url = `https://github.com/aws/aws-sam-cli/releases/latest/download/${assetName}`;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-cli-install-'));
  const zipPath = path.join(workDir, assetName);
  const extractDir = path.join(workDir, 'sam-installation');

  try {
    logger.info(`Downloading ${url}`);
    const download = spawnSync('curl', ['-fsSL', '-o', zipPath, url], { stdio: 'inherit' });
    if (download.status !== 0) {
      logger.error('Failed to download the SAM CLI installer.');
      return false;
    }

    const unzip = spawnSync('unzip', ['-q', zipPath, '-d', extractDir], { stdio: 'inherit' });
    if (unzip.status !== 0) {
      logger.error('Failed to extract the SAM CLI installer.');
      return false;
    }

    const installScript = path.join(extractDir, 'install');
    fs.chmodSync(installScript, 0o755);

    const install = spawnSync(
      installScript,
      ['--install-dir', SAM_INSTALL_DIR, '--bin-dir', SAM_BIN_DIR, '--update'],
      { stdio: 'inherit' },
    );
    if (install.status !== 0) {
      logger.error('SAM CLI installer exited with an error.');
      return false;
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }

  // Make it visible to `sam` calls made later in this same process, without waiting
  // for the user to open a new shell.
  process.env.PATH = `${SAM_BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`;

  if (!isSamCliAvailable()) {
    logger.error(`Installed, but "sam" still isn't runnable from ${SAM_BIN_DIR}.`);
    return false;
  }

  logger.success(`AWS SAM CLI installed to ${SAM_BIN_DIR}`);
  const alreadyOnPath = (process.env.PATH ?? '')
    .split(path.delimiter)
    .slice(1)
    .includes(SAM_BIN_DIR);
  if (!alreadyOnPath) {
    logger.warn(`Add ${SAM_BIN_DIR} to your shell profile's PATH so future sessions can find it.`);
  }

  return true;
}

export async function ensureSamCli(): Promise<boolean> {
  if (isSamCliAvailable()) return true;

  if (process.platform !== 'linux') {
    logger.error('AWS SAM CLI was not found, and auto-install is only supported on Linux.');
    logger.info(
      process.platform === 'darwin'
        ? 'Install it with: brew install aws-sam-cli'
        : 'Install it manually: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html',
    );
    return false;
  }

  logger.warn('AWS SAM CLI was not found on PATH.');
  const { confirmInstall } = await inquirer.prompt<{ confirmInstall: boolean }>([
    {
      type: 'input',
      name: 'confirmInstall',
      message: `Download and install it now to ${SAM_BIN_DIR} (no sudo required)? (y/n)`,
      filter: filterYesNo,
      validate: validateYesNo,
      transformer: transformYesNo,
    },
  ]);

  if (!confirmInstall) {
    logger.info('Skipping. Install AWS SAM CLI manually and re-run deploy.');
    return false;
  }

  return installSamCliStandalone();
}

export async function runDeploy(file: string, options: DeployOptions): Promise<void> {
  const filePath = path.isAbsolute(file) ? file : resolveOutputPath(file);

  if (!fileExists(filePath)) {
    logger.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  if (
    options.environment &&
    !DEPLOY_ENVIRONMENTS.includes(options.environment as DeployEnvironment)
  ) {
    logger.error(
      `Invalid --environment "${options.environment}". Must be one of: ${DEPLOY_ENVIRONMENTS.join(', ')}`,
    );
    process.exit(1);
  }

  if (!(await ensureSamCli())) {
    process.exit(1);
  }

  const args = [
    'deploy',
    '--template-file',
    filePath,
    '--stack-name',
    options.stackName,
    '--capabilities',
    'CAPABILITY_IAM',
    '--resolve-s3',
    '--no-fail-on-empty-changeset',
  ];

  if (options.profile) args.push('--profile', options.profile);
  if (options.region) args.push('--region', options.region);
  if (options.environment) {
    args.push('--parameter-overrides', `Environment=${options.environment}`);
  }

  logger.title('Deploying CloudFormation Stack (via AWS SAM)');
  logger.info(`Running: sam ${args.join(' ')}\n`);

  const result = spawnSync('sam', args, { stdio: 'inherit' });

  if (result.error) {
    logger.error(`Failed to run sam CLI: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    logger.error('Deployment failed.');
    process.exit(result.status ?? 1);
  }

  logger.divider();
  logger.success(`Stack "${options.stackName}" deployed successfully.`);
  logger.divider();
}

export function registerDeployCommand(program: Command): void {
  program
    .command('deploy')
    .description('Deploy a generated CloudFormation template with `sam deploy`')
    .argument('<file>', 'Path to a generated cognito-template.yaml')
    .requiredOption('-s, --stack-name <name>', 'CloudFormation stack name')
    .option('-p, --profile <name>', 'AWS CLI profile to use for credentials')
    .option(
      '-r, --region <region>',
      'AWS region to deploy into (defaults to the profile/env region)',
    )
    .option(
      '-e, --environment <env>',
      `Deploy stage to set on the template's Environment parameter (${DEPLOY_ENVIRONMENTS.join('/')}; defaults to the template's own default, "${DEPLOY_ENVIRONMENTS[0]}")`,
    )
    .action(async (file: string, options: DeployOptions) => {
      await requireAwsIdentity(options.profile);

      await runDeploy(file, options);
    });
}
