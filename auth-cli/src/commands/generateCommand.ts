import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { Command } from 'commander';
import { runAuthPrompts } from '../prompts/authPrompts';
import { ConfigService } from '../services/configService';
import { ConfigValidator } from '../validators/configValidator';
import { generateCfnTemplate } from '../utils/cfnGenerator';
import { cfnTemplateToAuthConfig, isCfnTemplate } from '../utils/cfnParser';
import { logger } from '../utils/logger';
import { hasAwsCredentialsInEnv, runDeploy } from './deployCommand';
import { CFN_OUTPUT_FILE } from '../config/constants';
import {
  DEFAULT_RESOURCE_DIR,
  ensureDirExists,
  fileExists,
  readYaml,
  resolveDefaultOutputDir,
  resolveOutputPath,
} from '../utils/fileUtils';
import { AuthConfig } from '../types';

export function loadConfigFromFile(file: string): {
  config: AuthConfig;
  filePath: string;
  fromTemplate: boolean;
} {
  const filePath = path.isAbsolute(file) ? file : resolveOutputPath(file);

  if (!fileExists(filePath)) {
    logger.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  logger.info(`Reading: ${filePath}`);

  const raw = readYaml(filePath);

  if (isCfnTemplate(raw)) {
    return { config: cfnTemplateToAuthConfig(raw), filePath, fromTemplate: true };
  }

  const validator = new ConfigValidator();
  const result = validator.validate(raw);

  if (!result.valid) {
    logger.error('Cannot generate template — auth-config.yaml has validation errors:');
    result.errors.forEach((e) => logger.list([e]));
    process.exit(1);
  }

  return { config: raw as AuthConfig, filePath, fromTemplate: false };
}

export function runGenerate(file: string, output: string): void {
  const { config } = loadConfigFromFile(file);
  const outputPath = path.isAbsolute(output) ? output : resolveOutputPath(output);
  writeCfnOutput(config, outputPath);
}

export function writeCfnOutput(config: AuthConfig, outputPath: string): void {
  const template = generateCfnTemplate(config);

  ensureDirExists(path.dirname(outputPath));
  fs.writeFileSync(outputPath, template, 'utf8');

  logger.divider();
  logger.success(`CloudFormation template written to: ${chalk.bold(outputPath)}`);
  logger.divider();
  logger.info(
    `Deploy with: ${chalk.gray(`sam deploy --template-file ${path.basename(outputPath)} --stack-name ${config.poolName} --capabilities CAPABILITY_IAM --resolve-s3`)}`,
  );
}

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate')
    .description('Generate a CloudFormation template by answering the setup wizard')
    .option(
      '-o, --output <file>',
      `Output path for the CloudFormation template (default: ${DEFAULT_RESOURCE_DIR}/${CFN_OUTPUT_FILE})`,
    )
    .action(async (options: { output?: string }) => {
      const outputPath =
        options.output ?? resolveOutputPath(CFN_OUTPUT_FILE, resolveDefaultOutputDir());

      logger.title('AWS Cognito Auth Configuration Wizard');
      logger.info('Answer the following questions to generate your CloudFormation template\n');

      const answers = await runAuthPrompts();

      const validator = new ConfigValidator();
      const service = new ConfigService(validator);

      const config: AuthConfig = service.buildConfig(answers);
      const result = service.validateConfig(config);

      if (!result.valid) {
        logger.error('Cannot generate template — configuration has validation errors:');
        result.errors.forEach((e) => logger.list([e]));
        process.exit(1);
      }

      writeCfnOutput(config, outputPath);

      await promptDeploy(outputPath, config.poolName);
    });
}

async function promptDeploy(templatePath: string, defaultStackName: string): Promise<void> {
  const { shouldDeploy } = await inquirer.prompt<{ shouldDeploy: boolean }>([
    {
      type: 'confirm',
      name: 'shouldDeploy',
      message: 'Deploy this stack now with `sam deploy`?',
      default: false,
    },
  ]);

  if (!shouldDeploy) return;

  if (!hasAwsCredentialsInEnv()) {
    logger.warn('No AWS credentials detected in this shell. Export them first, e.g.:');
    logger.list([
      'export AWS_ACCESS_KEY_ID=...',
      'export AWS_SECRET_ACCESS_KEY=...',
      'export AWS_SESSION_TOKEN=...   # only if using temporary/SSO credentials',
    ]);
  }

  const { stackName, profile, ready } = await inquirer.prompt<{
    stackName: string;
    profile: string;
    ready: boolean;
  }>([
    {
      type: 'input',
      name: 'stackName',
      message: 'Stack name:',
      default: defaultStackName,
    },
    {
      type: 'input',
      name: 'profile',
      message: 'AWS CLI profile (leave blank to use exported credentials):',
    },
    {
      type: 'confirm',
      name: 'ready',
      message: 'Credentials are exported and ready — continue with deployment?',
      default: false,
    },
  ]);

  if (!ready) {
    logger.info('Deployment skipped.');
    return;
  }

  await runDeploy(templatePath, { stackName, profile: profile || undefined });
}
