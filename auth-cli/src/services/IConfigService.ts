import { AuthConfig, ValidationResult } from '../types';

export interface IConfigService {
  buildConfig(answers: AuthConfig): AuthConfig;
  saveConfig(config: AuthConfig, outputPath: string): void;
  loadConfig(filePath: string): AuthConfig;
  validateConfig(config: unknown): ValidationResult;
}
