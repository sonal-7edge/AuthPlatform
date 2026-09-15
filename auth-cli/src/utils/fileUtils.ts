import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { AuthConfig } from '../types';
import { parseCfnYaml } from './cfnParser';

export const DEFAULT_RESOURCE_DIR = 'resources/auth';

export function resolveOutputPath(filename: string, dir?: string): string {
  return path.resolve(dir ?? process.cwd(), filename);
}

// Used when the user doesn't pass an explicit --output directory: writes land in
// resources/auth (created on first use) instead of scattering into the cwd.
export function resolveDefaultOutputDir(): string {
  const dir = path.resolve(process.cwd(), DEFAULT_RESOURCE_DIR);
  ensureDirExists(dir);
  return dir;
}

export function ensureDirExists(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function writeYaml(filePath: string, data: AuthConfig): void {
  ensureDirExists(path.dirname(filePath));
  const content = yaml.dump(data, {
    indent: 2,
    lineWidth: 120,
    quotingType: '"',
    forceQuotes: false,
  });
  fs.writeFileSync(filePath, content, 'utf8');
}

export function readYaml(filePath: string): unknown {
  if (!fileExists(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  // CFN-aware so this can read back either a plain auth-config.yaml or a
  // generated cognito-template.yaml (which uses !Sub/!Ref/!GetAtt tags).
  return parseCfnYaml(content);
}
