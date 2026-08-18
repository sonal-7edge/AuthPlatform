#!/usr/bin/env node
import { Command } from 'commander';
import { registerValidateCommand } from './commands/validateCommand';
import { registerGenerateCommand } from './commands/generateCommand';
import { registerAddClientCommand } from './commands/addClientCommand';
import { registerDeployCommand } from './commands/deployCommand';

const program = new Command();

program.name('auth').description('AWS Cognito resource provisioning CLI').version('1.0.0');

registerValidateCommand(program);
registerGenerateCommand(program);
registerAddClientCommand(program);
registerDeployCommand(program);

program.parse(process.argv);
