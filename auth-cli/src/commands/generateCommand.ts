import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { Command } from 'commander';
import { runAuthPrompts } from '../prompts/authPrompts';
import { ConfigService } from '../services/configService';
import { ConfigValidator } from '../validators/configValidator';
import { generateCfnTemplate } from '../utils/cfnGenerator';
import { cfnTemplateToAuthConfig, isCfnTemplate } from '../utils/cfnParser';
import { logger } from '../utils/logger';
import { CFN_OUTPUT_FILE, OUTPUT_FILE } from '../config/constants';
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
    `Deploy with: ${chalk.gray(`aws cloudformation deploy --template-file ${path.basename(outputPath)} --stack-name ${config.poolName}`)}`,
  );
}

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate')
    .description(
      'Generate a CloudFormation template, interactively or from an existing auth-config.yaml or cognito-template.yaml',
    )
    .argument(
      '[file]',
      `Path to an existing ${OUTPUT_FILE} or generated CFN template to regenerate from (skips the wizard). If omitted, runs the wizard and generates the template directly — no config file is written. To add an app client to an existing file, use "add-client" instead.`,
    )
    .option(
      '-o, --output <file>',
      `Output path for the CloudFormation template (default: ${DEFAULT_RESOURCE_DIR}/${CFN_OUTPUT_FILE})`,
    )
    .action(async (file: string | undefined, options: { output?: string }) => {
      if (file) {
        const { config, filePath, fromTemplate } = loadConfigFromFile(file);

        // Regenerating from the template itself updates it in place by default;
        // regenerating from an auth-config.yaml writes alongside it, never over it.
        const outputPath = options.output
          ? path.isAbsolute(options.output)
            ? options.output
            : resolveOutputPath(options.output)
          : fromTemplate
            ? filePath
            : resolveOutputPath(CFN_OUTPUT_FILE, path.dirname(filePath));

        writeCfnOutput(config, outputPath);
        return;
      }

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
    });
}
