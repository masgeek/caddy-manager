import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["**/dist/", "**/node_modules/", "**/.turbo/"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off",
    },
  },
];
