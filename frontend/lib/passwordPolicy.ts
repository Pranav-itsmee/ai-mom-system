export const PASSWORD_MIN_LENGTH = 10;

export const PASSWORD_RULES = [
  {
    id: 'length',
    test: (password: string) => password.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: 'uppercase',
    test: (password: string) => /[A-Z]/.test(password),
  },
  {
    id: 'lowercase',
    test: (password: string) => /[a-z]/.test(password),
  },
  {
    id: 'number',
    test: (password: string) => /\d/.test(password),
  },
  {
    id: 'special',
    test: (password: string) => /[^A-Za-z0-9]/.test(password),
  },
] as const;

export function getPasswordRuleStates(password: string) {
  return PASSWORD_RULES.map((rule) => ({
    ...rule,
    passed: rule.test(password),
  }));
}
