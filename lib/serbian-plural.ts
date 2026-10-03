export type SerbianPluralForms = readonly [
  singular: string,
  paucal: string,
  plural: string,
];

export function serbianPluralForm(
  value: number,
  [singular, paucal, plural]: SerbianPluralForms,
) {
  const absoluteValue = Math.abs(Math.trunc(value));
  const lastTwoDigits = absoluteValue % 100;
  const lastDigit = absoluteValue % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return plural;
  }

  if (lastDigit === 1) {
    return singular;
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return paucal;
  }

  return plural;
}
