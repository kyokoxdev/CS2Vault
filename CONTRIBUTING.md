# Contributing to CS2Vault

First off, thank you for considering contributing to CS2Vault! It's people like you that make the open-source community such a great place to learn, inspire, and create.

This document serves as a set of guidelines for contributing to the repository. Please also make sure to read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Technology Stack

Before you begin, ensure you are familiar with our tech stack:
- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript 5
- **Database ORM:** Prisma
- **Database:** SQLite/Turso (libSQL)
- **Styling:** CSS Modules
- **Testing:** Vitest (Unit/Integration) & Playwright (E2E)

---

## Getting Started

### 1. Prerequisites
- Node.js 20+
- npm (or pnpm/yarn)
- Git

### 2. Local Setup
Fork and clone the repository to your local machine:

```bash
git clone https://github.com/<your-username>/CS2Vault.git
cd CS2Vault
```

Install the project dependencies:
```bash
npm install
```

### 3. Environment Variables
Copy the template `.env.example` file to create your local `.env.local` configuration:
```bash
cp .env.example .env.local
```
Make sure to fill in the minimum required environment variables required for your feature. At a minimum, `DATABASE_URL` will default to `file:./dev.db` for local SQLite development.

### 4. Database Initialization
Generate the Prisma client and push the schema to your local SQLite database:
```bash
npx prisma generate
npx prisma db push
```

You can optionally seed the database with initial application state/settings:
```bash
npm run db:seed
```

### 5. Running the Application
Start the development server:
```bash
npm run dev
```
The app should now be running at [http://localhost:3000](http://localhost:3000).

---

## Project Structure

A quick overview of the repository's main directories:

- `src/app/` — Next.js App Router (pages, layouts, API routes).
- `src/components/` — Reusable React components (UI elements, layout components).
- `src/lib/` — Core business logic, utilities, API clients, and database helpers.
- `src/hooks/` — Custom React hooks.
- `tests/` — Test files spanning unit, integration, and end-to-end tests.
- `prisma/` — Prisma schema (`schema.prisma`) and seed scripts.

---

## Development Guidelines

### Code Style
- **TypeScript:** Use strict typing for all variables, functions, and components. Avoid `any` where possible.
- **Styling:** We use standard CSS Modules. Avoid inline styles or adding Tailwind unless explicitly required for a new component architecture.
- **Linting:** Ensure your code passes all lint checks before opening a pull request.
  ```bash
  npm run lint
  ```

### Testing
Tests are highly encouraged for new features or bug fixes.
- **Unit & Integration:** We use Vitest. Run tests using:
  ```bash
  npm run test
  # or in watch mode
  npm run test:watch
  ```
- **End-to-End:** Run Playwright for E2E tests:
  ```bash
  npx playwright test
  ```

---

## Pull Request Process

1. **Branch Naming**: Please create a branch with a clear name related to the issue or feature you are working on. e.g., `feature/add-market-chart` or `fix/nav-dropdown-bug`.
2. **Commit Messages**: Write clear, descriptive commit messages.
3. **Tests**: Verify that existing tests pass, and add new ones if feasible.
4. **Code Quality**: Run the linter (`npm run lint`) to maintain code consistency.
5. **PR Description**: Describe your changes in detail in the PR description, referencing any relevant issues.
6. **Review**: Wait for the repository maintainers to review your pull request. They may ask for changes before merging.

Thank you for contributing to CS2Vault! Your work is genuinely appreciated.
