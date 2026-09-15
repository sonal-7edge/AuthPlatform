import chalk from 'chalk';

export const logger = {
  info: (msg: string): void => {
    console.log(chalk.cyan('ℹ'), msg);
  },

  success: (msg: string): void => {
    console.log(chalk.green('✔'), chalk.green(msg));
  },

  warn: (msg: string): void => {
    console.log(chalk.yellow('⚠'), chalk.yellow(msg));
  },

  error: (msg: string): void => {
    console.error(chalk.red('✖'), chalk.red(msg));
  },

  title: (msg: string): void => {
    console.log('\n' + chalk.bold.blue(msg) + '\n');
  },

  divider: (): void => {
    console.log(chalk.gray('─'.repeat(50)));
  },

  list: (items: string[]): void => {
    items.forEach((item) => console.log(chalk.gray('  •'), item));
  },
};
