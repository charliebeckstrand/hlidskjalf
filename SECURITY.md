# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.4.x   | :white_check_mark: |
| < 0.4   | :x:                |

## Trust Model

Run `hlidskjalf` only in repositories you trust. On launch it imports a
`hlidskjalf.config.{ts,mjs,js}` from the working directory, which runs that
file's code, and it starts each workspace's `dev` script. A hostile repository
can therefore execute arbitrary code the moment you launch the tool inside it.
As with `vite.config.ts` and similar dev tooling, this is inherent to the task,
not a vulnerability.

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Please do not open a public issue for security vulnerabilities.**

Instead, please report them via email or by opening a private security advisory on GitHub:

1. Go to the [Security Advisories](https://github.com/charliebeckstrand/hlidskjalf/security/advisories) page
2. Click "New draft security advisory"
3. Fill in the details of the vulnerability

### What to expect

- You will receive an acknowledgment within 48 hours
- A detailed response will follow within 7 days, outlining next steps
- Security patches will be released as soon as possible after validation

Thank you for helping keep this project safe.
