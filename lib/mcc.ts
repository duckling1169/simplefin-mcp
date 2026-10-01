// Coarse category names for ISO 18245 merchant category codes. SimpleFin only passes the code
// through (often null), so this is best-effort. The narrowest matching range wins.
const RANGES: [number, number, string][] = [
  [3000, 3350, "Airlines"],
  [3351, 3500, "Car rental"],
  [3501, 3999, "Lodging"],
  [4000, 4299, "Transportation"],
  [4400, 4799, "Travel"],
  [4800, 4899, "Telecom"],
  [4900, 4999, "Utilities"],
  [5200, 5299, "Home improvement"],
  [5300, 5399, "General merchandise"],
  [5411, 5411, "Groceries"],
  [5412, 5499, "Food stores"],
  [5500, 5599, "Auto"],
  [5541, 5542, "Gas"],
  [5600, 5699, "Clothing"],
  [5700, 5799, "Home & electronics"],
  [5811, 5814, "Restaurants & bars"],
  [5900, 5999, "Retail"],
  [5912, 5912, "Pharmacy"],
  [6010, 6099, "Financial"],
  [6300, 6399, "Insurance"],
  [7000, 7099, "Lodging"],
  [7200, 7299, "Personal services"],
  [7500, 7599, "Auto services"],
  [7800, 7999, "Entertainment"],
  [8000, 8999, "Professional services"],
  [8000, 8099, "Health care"],
  [8200, 8299, "Education"],
  [9000, 9999, "Government"],
];

export function mccCategory(mcc: string | null): string {
  const code = mcc ? Number(mcc) : NaN;
  if (!Number.isFinite(code)) return "Uncategorized";
  let best: [number, number, string] | undefined;
  for (const r of RANGES) {
    if (code >= r[0] && code <= r[1] && (!best || r[1] - r[0] < best[1] - best[0])) best = r;
  }
  return best ? best[2] : `MCC ${mcc}`;
}
