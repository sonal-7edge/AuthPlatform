import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConfigService } from '../src/services/configService';
import { ConfigValidator } from '../src/validators/configValidator';
import { AuthConfig } from '../src/types';

const defaultAnswers: AuthConfig = {
  provider: 'aws',
  region: 'us-east-1',
  poolName: 'my-project-users',
  selfSignup: true,
  emailVerification: true,
  deletionProtection: true,
  customAttributes: [],
  signInOptions: ['email'],
  passwordPolicy: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSymbols: false,
    tempPasswordDays: 7,
  },
  mfa: { enabled: false, mode: 'off', methods: [] },
  appClients: [
    {
      name: 'web-client',
      generateSecret: false,
      authFlows: ['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
      accessTokenValidity: 60,
      idTokenValidity: 60,
      refreshTokenValidity: 30,
      callbackUrls: ['https://example.com/callback', ''],
      logoutUrls: ['https://example.com/logout', ''],
    },
  ],
  lambdaTriggers: {
    preSignUp: '  ',
    postConfirmation: '',
    preAuthentication: '',
    postAuthentication: '',
    customMessage: '',
    preTokenGeneration: '',
    userMigration: '',
    defineChallenge: '',
    createChallenge: '',
    verifyChallenge: '',
  },
};

describe('ConfigService', () => {
  let service: ConfigService;
  let tmpDir: string;

  beforeEach(() => {
    service = new ConfigService(new ConfigValidator());
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-cli-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('buildConfig()', () => {
    it('passes through the wizard answers', () => {
      const config = service.buildConfig(defaultAnswers);

      expect(config.provider).toBe('aws');
      expect(config.region).toBe('us-east-1');
      expect(config.poolName).toBe('my-project-users');
      expect(config.signInOptions).toEqual(['email']);
      expect(config.selfSignup).toBe(true);
      expect(config.mfa.enabled).toBe(false);
    });

    it('trims the pool name', () => {
      const answers = { ...defaultAnswers, poolName: '  my-project-users  ' };
      const config = service.buildConfig(answers);
      expect(config.poolName).toBe('my-project-users');
    });

    it('filters blank callback and logout URLs from app clients', () => {
      const config = service.buildConfig(defaultAnswers);
      expect(config.appClients[0].callbackUrls).toEqual(['https://example.com/callback']);
      expect(config.appClients[0].logoutUrls).toEqual(['https://example.com/logout']);
    });

    it('trims lambda trigger ARNs', () => {
      const config = service.buildConfig(defaultAnswers);
      expect(config.lambdaTriggers.preSignUp).toBe('');
    });

    it('preserves multiple app clients', () => {
      const answers = {
        ...defaultAnswers,
        appClients: [
          defaultAnswers.appClients[0],
          { ...defaultAnswers.appClients[0], name: 'mobile-client' },
        ],
      };
      const config = service.buildConfig(answers);
      expect(config.appClients).toHaveLength(2);
      expect(config.appClients[1].name).toBe('mobile-client');
    });
  });

  describe('saveConfig() and loadConfig()', () => {
    it('saves and reloads a config round-trip correctly', () => {
      const config = service.buildConfig(defaultAnswers);
      const filePath = path.join(tmpDir, 'auth-config.yaml');

      service.saveConfig(config, filePath);
      expect(fs.existsSync(filePath)).toBe(true);

      const loaded = service.loadConfig(filePath);
      expect(loaded.provider).toBe(config.provider);
      expect(loaded.region).toBe(config.region);
      expect(loaded.poolName).toBe(config.poolName);
      expect(loaded.signInOptions).toEqual(config.signInOptions);
      expect(loaded.appClients).toEqual(config.appClients);
    });

    it('writes valid YAML that can be parsed', () => {
      const config = service.buildConfig(defaultAnswers);
      const filePath = path.join(tmpDir, 'auth-config.yaml');
      service.saveConfig(config, filePath);

      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain('my-project-users');
      expect(content).toContain('us-east-1');
      expect(content).toContain('appClients');
      expect(content).toContain('web-client');
      expect(content).toContain('lambdaTriggers');
    });

    it('throws when loading a non-existent file', () => {
      expect(() => service.loadConfig('/nonexistent/auth-config.yaml')).toThrow();
    });

    it('throws when loading a file with invalid config', () => {
      const filePath = path.join(tmpDir, 'bad-config.yaml');
      fs.writeFileSync(filePath, 'provider: aws\npoolName: ""\nregion: bad-region\n', 'utf8');
      expect(() => service.loadConfig(filePath)).toThrow('Invalid config');
    });
  });

  describe('validateConfig()', () => {
    it('returns valid=true for a correct AuthConfig object', () => {
      const config = service.buildConfig(defaultAnswers);
      const result = service.validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('returns valid=false for null', () => {
      const result = service.validateConfig(null);
      expect(result.valid).toBe(false);
    });
  });
});
