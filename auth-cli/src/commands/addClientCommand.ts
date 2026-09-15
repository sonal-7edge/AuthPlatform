import path from 'path';
import chalk from 'chalk';
import { Command } from 'commander';
import { collectAppClients } from '../prompts/authPrompts';
import { ConfigService } from '../services/configService';
import { ConfigValidator } from '../validators/configValidator';
import { logger } from '../utils/logger';
import { CFN_OUTPUT_FILE } from '../config/constants';
import { resolveOutputPath } from '../utils/fileUtils';
import { loadConfigFromFile, writeCfnOutput } from './generateCommand';

export function registerAddClientCommand(program: Command): void {
  program
    .command('add-client')
    .description('Add an app client to an existing auth-config.yaml or cognito-template.yaml')
    .argument('<file>', 'Path to an existing auth-config.yaml or generated cognito-template.yaml')
    .option(
      '-o, --output <file>',
      'Output path for the updated CloudFormation template (default: overwrites the template in place, or writes alongside an auth-config.yaml)',
    )
    .action(async (file: string, options: { output?: string }) => {
      const { config, filePath, fromTemplate } = loadConfigFromFile(file);

      const appClients = await collectAppClients(config.appClients);
      config.appClients = appClients;

      if (!fromTemplate) {
        new ConfigService(new ConfigValidator()).saveConfig(config, filePath);
        logger.divider();
        logger.success(`Configuration updated: ${chalk.bold(filePath)}`);
      }

      const outputPath = options.output
        ? path.isAbsolute(options.output)
          ? options.output
          : resolveOutputPath(options.output)
        : fromTemplate
          ? filePath
          : resolveOutputPath(CFN_OUTPUT_FILE, path.dirname(filePath));

      writeCfnOutput(config, outputPath);
    });
}
