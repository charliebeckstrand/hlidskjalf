# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.4.x   | :white_check_mark: |
| < 0.4   | :x:                |

## Trust Model

Run `hlidskjalf` only in repositories you trust. Like other dev tooling (e.g.
`vite.config.ts`), it loads a `hlidskjalf.config.{ts,mjs,js}` from the working
directory by importing it, which executes that file's code on launch. It also
runs each workspace's `dev` script. A hostile repository can therefore run
arbitrary code the moment you start the tool inside it — this is inherent to
the task, not a vulnerability.

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
