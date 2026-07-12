export const money = (value: number) =>
  `${new Intl.NumberFormat("pl-PL").format(value)} zł`;

export const distance = (value: number) =>
  value > 900 ? "odległość do uzupełnienia" : `${value} km od Poznania`;
