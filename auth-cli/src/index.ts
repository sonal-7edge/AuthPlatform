#!/usr/bin/env node
import { Command } from 'commander';
import { registerGenerateCommand } from './commands/generateCommand';
import { registerAddClientCommand } from './commands/addClientCommand';
import { registerDeployCommand } from './commands/deployCommand';

const program = new Command();

program.name('auth').description('AWS Cognito resource provisioning CLI').version('1.0.0');

registerGenerateCommand(program);
registerAddClientCommand(program);
registerDeployCommand(program);

// Commander's default top-level help only shows "[options]" next to each command — the actual
// flags only appear once you drill into `auth <command> --help`. Listing them here too means
// `auth --help` alone tells you everything you can pass, no extra lookup needed.
program.addHelpText(
  'after',
  `
Command Options:
  generate
    -o, --output <file>       Output path for the CloudFormation template
                               (default: resources/auth/cognito-template.yaml)

  add-client <file>
    -o, --output <file>       Output path for the updated CloudFormation template
                               (default: overwrites the template in place, or writes
                               alongside an auth-config.yaml)

  deploy <file>
    -p, --profile <name>      AWS CLI profile to use for credentials
    -r, --region <region>     AWS region to deploy into (defaults to the profile/env region)
    -e, --environment <env>   Deploy stage to set on the template's Environment parameter
                               (dev/qa/pre-prod/prod; defaults to "dev")

Run "auth <command> --help" for a command's full usage.`,
);

program.parse(process.argv);
