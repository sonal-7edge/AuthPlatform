// inquirer's built-in `confirm` type has no validation step: any input that doesn't start
// with "y" (including garbage like "bbbb") silently resolves to `false`. Pairing `type: 'input'`
// with this filter/validate instead rejects anything that isn't yes/no and re-prompts.
export const filterYesNo = (input: string): string | boolean => {
  const answer = input.trim().toLowerCase();
  if (answer === 'y' || answer === 'yes') return true;
  if (answer === 'n' || answer === 'no') return false;
  return input;
};

export const validateYesNo = (input: string | boolean): boolean | string =>
  typeof input === 'boolean' ? true : 'Please answer yes or no (y/n)';

// Without this, the final line renders the filtered boolean via string concatenation
// ("... (y/n) true"/"false") instead of "Yes"/"No" — this restores that display, matching what
// the old `type: 'confirm'` prompt showed. While the user is still typing, `isFinal` is false and
// the answer isn't filtered yet, so it just echoes back what they've typed so far.
export const transformYesNo = (
  input: string | boolean,
  _answers: unknown,
  { isFinal }: { isFinal: boolean },
): string => (isFinal && typeof input === 'boolean' ? (input ? 'Yes' : 'No') : String(input));
