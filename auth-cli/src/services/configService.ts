import { AuthConfig, LambdaTriggers, ValidationResult } from '../types';
import { IConfigService } from './IConfigService';
import { writeYaml, readYaml } from '../utils/fileUtils';
import { ConfigValidator } from '../validators/configValidator';

export class ConfigService implements IConfigService {
  private readonly validator: ConfigValidator;

  constructor(validator: ConfigValidator = new ConfigValidator()) {
    this.validator = validator;
  }

  buildConfig(answers: AuthConfig): AuthConfig {
    return {
      ...answers,
      poolName: answers.poolName.trim(),
      appClients: answers.appClients.map((client) => ({
        ...client,
        callbackUrls: client.callbackUrls.map((url) => url.trim()).filter(Boolean),
        logoutUrls: client.logoutUrls.map((url) => url.trim()).filter(Boolean),
      })),
      lambdaTriggers: Object.fromEntries(
        Object.entries(answers.lambdaTriggers).map(([key, value]) => [key, value.trim()]),
      ) as unknown as LambdaTriggers,
      customAttributes: answers.customAttributes.map((attr) => ({
        ...attr,
        name: attr.name.trim(),
      })),
    };
  }

  saveConfig(config: AuthConfig, outputPath: string): void {
    writeYaml(outputPath, config);
  }

  loadConfig(filePath: string): AuthConfig {
    const raw = readYaml(filePath);
    const result = this.validator.validate(raw);
    if (!result.valid) {
      throw new Error(`Invalid config:\n${result.errors.join('\n')}`);
    }
    return raw as AuthConfig;
  }

  validateConfig(config: unknown): ValidationResult {
    return this.validator.validate(config);
  }
}
