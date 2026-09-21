import path from 'path';
import { Command } from 'commander';
import { ConfigValidator } from '../validators/configValidator';
import { logger } from '../utils/logger';
import { OUTPUT_FILE } from '../config/constants';
import { readYaml, resolveOutputPath } from '../utils/fileUtils';

export function registerValidateCommand(program: Command): void {
  program
    .command('validate')
    .description('Validate an existing auth-config.yaml file')
    .argument('[file]', 'Path to auth-config.yaml', OUTPUT_FILE)
    .action((file: string) => {
      const filePath = path.isAbsolute(file) ? file : resolveOutputPath(file);

      logger.info(`Validating: ${filePath}\n`);

      let raw: unknown;
      try {
        raw = readYaml(filePath);
      } catch (err) {
        logger.error((err as Error).message);
        process.exit(1);
      }

      const validator = new ConfigValidator();
      const result = validator.validate(raw);

      if (result.valid) {
        logger.success('Configuration is valid.');
        process.exit(0);
      } else {
        logger.error('Configuration has validation errors:');
        result.errors.forEach((e) => logger.list([e]));
        process.exit(1);
      }
    });
}
